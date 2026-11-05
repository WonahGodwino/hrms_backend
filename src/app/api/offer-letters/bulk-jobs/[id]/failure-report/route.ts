// src/app/api/offer-letters/bulk-jobs/[id]/failure-report/route.ts
//
// GET — builds and streams an Excel report of every row that failed in a
// bulk job (create or edit), generated entirely from the job's structured
// `errors` JSON already in Postgres — no physical file is ever persisted.
//
// For a CREATE job, the report's columns are exactly the original upload
// sheet's columns (row/error first, then every field from that row) — so it
// is itself directly re-uploadable: the create endpoint only reads columns
// it recognizes by name and ignores the rest, so `row`/`error` are silently
// skipped on re-upload without needing a separate "clean" copy.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import ExcelJS from 'exceljs'
import { writeStyledTable, buildSubtitle, confidentialFooter, toneCell, attachmentDisposition, safeFileName, addInstructionsSheet, findHeaderRow, XLSX_MIME } from '@/app/lib/excel/sheet-theme'
import { buildOfferLetterFieldLabels, BASE_FIELD_KEYS } from '@/app/lib/offer-letters/variableLabels'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const job = await prisma.offerLetterBulkJob.findUnique({ where: { id } })
    if (!job) {
      return withCors(ApiResponse.error('Bulk job not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, job.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const errors = (job.errors as Array<{ row: number; message: string; data: Record<string, any> }>) || []
    if (errors.length === 0) {
      return withCors(ApiResponse.error('No failed rows to report for this job', 404), origin)
    }

    const dataKeys = new Set<string>()
    errors.forEach((e) => Object.keys(e.data || {}).forEach((k) => dataKeys.add(k)))

    // The row data was stored keyed by raw variable names (e.g.
    // "offer.effectiveDate") — recompute the same human-readable labels the
    // upload sheet used so this report reads naturally, while keeping the
    // column `key` as the raw name so re-uploading it resolves correctly.
    const template = job.templateId
      ? await prisma.offerLetterTemplate.findUnique({ where: { id: job.templateId }, select: { variables: true } })
      : null
    const templateVariables = (template?.variables as string[]) || []
    const labels = buildOfferLetterFieldLabels([...BASE_FIELD_KEYS, ...templateVariables])

    const dataColumns = Array.from(dataKeys)
    const columns = ['row', 'error', ...dataColumns]

    const company = await prisma.company.findUnique({ where: { id: job.companyId }, select: { companyName: true } })

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Failed Rows')

    // The header sits on row 4 under the title band; the bulk-create upload finds it by column label.
    writeStyledTable(worksheet, {
      title: `Offer Letters ${job.jobType === 'EDIT' ? 'Bulk Edit' : 'Bulk Create'}, Failed Rows`,
      subtitle: buildSubtitle([company?.companyName, `${errors.length} failed row${errors.length === 1 ? '' : 's'}`, 'Correct the errors and re-upload']),
      columns: columns.map((c) => {
        if (c === 'row') return { header: 'Row', key: c, width: 10, align: 'center' as const }
        if (c === 'error') return { header: 'Error', key: c, width: 50, align: 'left' as const }
        if (c === 'letterId') return { header: 'letterId', key: c, width: 26, align: 'left' as const }
        return { header: labels.get(c) || c, key: c, width: 24, align: 'left' as const }
      }),
      rows: errors.map((e) => {
        const row: Record<string, any> = { row: e.row, error: e.message }
        Object.entries(e.data || {}).forEach(([k, v]) => {
          row[k] = v === null || v === undefined ? '' : String(v)
        })
        return row
      }),
      onRow: (row) => toneCell(row.getCell(2), 'danger'),
      footer: confidentialFooter(company?.companyName),
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': XLSX_MIME,
          'Content-Disposition': attachmentDisposition(`Offer Letters ${job.jobType === 'EDIT' ? 'Bulk Edit' : 'Bulk Create'} Failures (${safeFileName(company?.companyName || 'Company')}).xlsx`),
          'Cache-Control': 'no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
