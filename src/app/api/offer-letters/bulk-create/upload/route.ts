// src/app/api/offer-letters/bulk-create/upload/route.ts
//
// POST — async bulk-generate entrypoint: one row in the uploaded sheet
// produces one new offer letter. The file is parsed and structurally
// validated synchronously (missing columns get an immediate 400); the slow
// part — rendering a .docx per row — happens in the background. A row that
// fails validation or rendering simply isn't created; it's recorded in the
// job's failure list instead. Poll GET /offer-letters/bulk-jobs/status/[id].
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
import { processOfferLetterBulkCreateRow } from '@/app/lib/offer-letters/bulkCreateProcessing'
import { cellToString } from '@/app/lib/offer-letters/excelCell'
import { resolveHeaderLabelsToKeys, buildOfferLetterFieldLabels, BASE_FIELD_KEYS } from '@/app/lib/offer-letters/variableLabels'

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
    const templateId = formData.get('templateId') as string | null

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }
    if (!templateId) {
      return withCors(ApiResponse.error('A template is required', 400), origin)
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
          'A bulk job is already being processed for this company. Please wait for it to finish before starting another.',
          409
        ),
        origin
      )
    }

    const template = await prisma.offerLetterTemplate.findFirst({ where: { id: templateId, companyId } })
    if (!template) {
      return withCors(ApiResponse.error('Template not found for this company', 404), origin)
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

    // The sheet shows human-readable column labels ("Effective Date")
    // instead of the raw {{dotted.path}} variable name — resolve them back
    // to the exact keys renderDocx expects, matched leniently against
    // labels recomputed fresh from this template's *current* variables (so
    // a variable added to the template after the sheet was first downloaded
    // still resolves correctly as long as its column header reads right).
    const templateVariables = (template.variables as string[]) || []
    const allKeys = [...BASE_FIELD_KEYS, ...templateVariables]
    const headers = resolveHeaderLabelsToKeys(rawHeaders, allKeys)
    const dataStartRow = 2

    // Check every column the template actually needs resolved — not just
    // the base fields — before touching a single row. A variable whose
    // column didn't match anything would otherwise only surface as an
    // opaque "missing value" failure deep inside rendering, on whichever row
    // happens to process first; catching it here means one clear message
    // naming exactly which column is missing or misnamed, before any letters
    // are generated.
    const missingKeys = allKeys.filter((k) => !headers.includes(k))
    if (missingKeys.length > 0) {
      const labels = buildOfferLetterFieldLabels(allKeys)
      return withCors(
        ApiResponse.error(`Missing required columns: ${missingKeys.map((k) => labels.get(k)).join(', ')}`, 400),
        origin
      )
    }

    const rows: Record<string, any>[] = []
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < dataStartRow) return
      const rowData: Record<string, any> = {}
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1]
        if (header) rowData[header] = cellToString(cell)
      })
      const hasAny = Object.values(rowData).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
      if (hasAny) rows.push(rowData)
    })

    if (rows.length === 0) {
      return withCors(ApiResponse.error('No data rows found in the file', 400), origin)
    }

    const job = await createPendingOfferLetterBulkJob(companyId, 'CREATE', template.id, file.name, user.userId, rows.length)

    // Respond immediately; letters are generated row-by-row in the
    // background. This process is a long-running Node server, not a
    // serverless function, so the event loop keeps running this work.
    processOfferLetterBulkCreateUploadInBackground({
      jobId: job.id,
      companyId,
      templateId: template.id,
      rows,
      dataStartRow,
      templateFileData: template.fileData as Buffer,
      templateVariables,
      userId: user.userId,
    }).catch((err) => {
      console.error('[OFFER_LETTER_BULK_CREATE] Unhandled background processing error:', err)
    })

    console.log('[OFFER_LETTER_BULK_CREATE] Accepted, processing in background', {
      jobId: job.id,
      companyId,
      totalRecords: rows.length,
    })

    return withCors(
      ApiResponse.success(
        { jobId: job.id, status: 'PROCESSING', totalRecords: rows.length },
        'File received — letters are being generated'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

async function processOfferLetterBulkCreateUploadInBackground({
  jobId,
  companyId,
  templateId,
  rows,
  dataStartRow,
  templateFileData,
  templateVariables,
  userId,
}: {
  jobId: string
  companyId: string
  templateId: string
  rows: Record<string, any>[]
  dataStartRow: number
  templateFileData: Buffer
  templateVariables: string[]
  userId: string
}) {
  const results: OfferLetterBulkJobResults = { successful: 0, failed: 0, errors: [] }

  try {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const displayRow = index + dataStartRow

      try {
        await processOfferLetterBulkCreateRow(row, companyId, templateId, templateFileData, templateVariables, userId)
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

    console.log('[OFFER_LETTER_BULK_CREATE] Completed successfully', {
      jobId,
      companyId,
      successful: results.successful,
      failed: results.failed,
    })
  } catch (processingError: any) {
    console.error('[OFFER_LETTER_BULK_CREATE] Processing error:', { jobId, error: processingError })
    await failOfferLetterBulkJobRecord(jobId, processingError.message || 'Unknown processing error')
  }
}
