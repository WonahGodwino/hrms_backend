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

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Failed Rows')
    worksheet.columns = columns.map((c) => {
      if (c === 'row') return { header: 'Row', key: c, width: 10 }
      if (c === 'error') return { header: 'Error', key: c, width: 44 }
      if (c === 'letterId') return { header: 'letterId', key: c, width: 24 }
      return { header: labels.get(c) || c, key: c, width: 24 }
    })

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } }

    errors.forEach((e, index) => {
      const row = worksheet.getRow(2 + index)
      row.getCell('row').value = e.row
      row.getCell('error').value = e.message
      Object.entries(e.data || {}).forEach(([k, v]) => {
        row.getCell(k).value = v === null || v === undefined ? '' : String(v)
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="offer-letters-${job.jobType.toLowerCase()}-failures.xlsx"`,
          'Cache-Control': 'no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
