// src/app/api/offer-letters/bulk-edit/upload/route.ts
//
// POST — async bulk-edit entrypoint. The uploaded Excel is parsed in-memory
// and validated structurally (fast, synchronous) so obviously-bad input gets
// an immediate 400. The actual per-row document regeneration — the slow
// part, since each row re-renders a .docx — happens in the background after
// the response is sent. Poll GET /offer-letters/bulk-jobs/status/[id] for
// progress (shared with bulk-create jobs); no file is ever written to disk,
// since nothing needs to survive a restart except the DB job row itself.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import ExcelJS from 'exceljs'
import {
  getActiveOfferLetterBulkJob,
  createPendingOfferLetterBulkJob,
  completeOfferLetterBulkJobRecord,
  failOfferLetterBulkJobRecord,
  type OfferLetterBulkJobResults,
} from '@/app/lib/offer-letters/bulkJobStatus'
import { processOfferLetterBulkEditRow } from '@/app/lib/offer-letters/bulkEditProcessing'
import { cellToString } from '@/app/lib/offer-letters/excelCell'
import { resolveHeaderLabelsToKeys, BASE_FIELD_KEYS } from '@/app/lib/offer-letters/variableLabels'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }
    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const activeJob = await getActiveOfferLetterBulkJob(companyId)
    if (activeJob) {
      return withCors(
        ApiResponse.error(
          'A bulk edit is already being processed for this company. Please wait for it to finish before uploading another file.',
          409
        ),
        origin
      )
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(fileExtension || '')) {
      return withCors(ApiResponse.error('Please upload an Excel (.xlsx) file.', 400), origin)
    }

    const bytes = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes as ArrayBuffer)
    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      return withCors(ApiResponse.error('No worksheet found in the Excel file', 400), origin)
    }

    const rawHeaders: string[] = []
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      rawHeaders[colNumber - 1] = cellToString(cell)
    })

    // "letterId" is a system identifier, not a template variable, so it's
    // never humanized — it's always matched literally.
    if (!rawHeaders.some((h) => h.trim().toLowerCase() === 'letterid')) {
      return withCors(ApiResponse.error('Missing required column: letterId', 400), origin)
    }

    const rawRows: Record<string, any>[] = []
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return
      const rowData: Record<string, any> = {}
      row.eachCell((cell, colNumber) => {
        const header = rawHeaders[colNumber - 1]
        if (header) rowData[header] = cellToString(cell)
      })
      const hasAny = Object.values(rowData).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
      if (hasAny) rawRows.push(rowData)
    })

    if (rawRows.length === 0) {
      return withCors(ApiResponse.error('No data rows found in the file', 400), origin)
    }

    // The download endpoint only ever produces sheets scoped to a single
    // template, so every row in a legitimate sheet shares one — resolve it
    // from the first row's letterId.
    const firstLetterId = String(rawRows[0].letterId || '').trim()
    const firstLetter = await prisma.generatedOfferLetter.findFirst({
      where: { id: firstLetterId, companyId },
      select: { templateId: true },
    })
    if (!firstLetter?.templateId) {
      return withCors(ApiResponse.error('Could not determine which template this sheet belongs to.', 400), origin)
    }

    const template = await prisma.offerLetterTemplate.findFirst({
      where: { id: firstLetter.templateId, companyId },
    })
    if (!template) {
      return withCors(ApiResponse.error('Template not found for this company', 404), origin)
    }

    // The sheet shows human-readable column labels ("Effective Date")
    // instead of raw {{dotted.path}} variable names — reconcile them back
    // to the exact keys renderDocx expects, matched leniently against
    // labels recomputed fresh from this template's *current* variables.
    // "letterId" isn't in this key set, so it passes through unchanged.
    const templateVariables = (template.variables as string[]) || []
    const allKeys = [...BASE_FIELD_KEYS, ...templateVariables]
    const resolvedHeaders = resolveHeaderLabelsToKeys(rawHeaders, allKeys)
    const headerKeyByRawText = new Map(rawHeaders.map((h, i) => [h, resolvedHeaders[i]]))
    const rows = rawRows.map((row) => {
      const resolved: Record<string, any> = {}
      for (const [rawKey, value] of Object.entries(row)) {
        resolved[headerKeyByRawText.get(rawKey) || rawKey] = value
      }
      return resolved
    })

    const job = await createPendingOfferLetterBulkJob(companyId, 'EDIT', template.id, file.name, user.userId, rows.length)

    // Respond immediately; row-by-row document regeneration continues after
    // the response is sent. This process is a long-running Node server, not
    // a serverless function, so the event loop keeps running this work.
    processOfferLetterBulkEditUploadInBackground({
      jobId: job.id,
      companyId,
      rows,
      templateFileData: template.fileData as Buffer,
      templateVariables,
      userId: user.userId,
    }).catch((err) => {
      console.error('[OFFER_LETTER_BULK_EDIT] Unhandled background processing error:', err)
    })

    console.log('[OFFER_LETTER_BULK_EDIT] Accepted, processing in background', {
      jobId: job.id,
      companyId,
      totalRecords: rows.length,
    })

    return withCors(
      ApiResponse.success(
        { jobId: job.id, status: 'PROCESSING', totalRecords: rows.length },
        'Bulk edit file received and is being processed'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

async function processOfferLetterBulkEditUploadInBackground({
  jobId,
  companyId,
  rows,
  templateFileData,
  templateVariables,
  userId,
}: {
  jobId: string
  companyId: string
  rows: Record<string, any>[]
  templateFileData: Buffer
  templateVariables: string[]
  userId: string
}) {
  const results: OfferLetterBulkJobResults = { successful: 0, failed: 0, errors: [] }

  try {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const displayRow = index + 2

      try {
        await processOfferLetterBulkEditRow(row, companyId, templateFileData, templateVariables, userId)
        results.successful++
      } catch (err: any) {
        results.failed++
        results.errors.push({
          row: displayRow,
          message: err?.message || 'An error occurred while processing this row.',
          data: row,
        })
      }
    }

    await completeOfferLetterBulkJobRecord(jobId, results)

    console.log('[OFFER_LETTER_BULK_EDIT] Completed successfully', {
      jobId,
      companyId,
      successful: results.successful,
      failed: results.failed,
    })
  } catch (processingError: any) {
    console.error('[OFFER_LETTER_BULK_EDIT] Processing error:', { jobId, error: processingError })
    await failOfferLetterBulkJobRecord(jobId, processingError.message || 'Unknown processing error')
  }
}
