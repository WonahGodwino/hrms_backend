// GET /api/recruitment/offers/template/download
// Streams a company-branded XLSX template for the bulk offer import workflow.
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { OFFER_IMPORT_COLUMNS } from '@/app/lib/offers/bulk-import-helpers'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { companyName: true, tradingName: true, address: true, email: true, phone: true, website: true },
    })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    const companyName = company.tradingName || company.companyName || 'Your Company'
    const columns = OFFER_IMPORT_COLUMNS

    const workbook = new ExcelJS.Workbook()
    workbook.creator = companyName
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('Bulk Offer Upload', {
      views: [{ state: 'frozen', ySplit: 5 }],
    })

    const lastCol = columns.length // number of columns
    const colLetter = (n: number) => String.fromCharCode(64 + n)
    const mergeAcross = (row: number) => `A${row}:${colLetter(lastCol)}${row}`

    const BRAND = 'FF0F172A'      // slate-900
    const ACCENT = 'FF2563EB'     // blue-600
    const HEADER_BG = 'FF1E293B'  // slate-800

    // Row 1 — Company name banner
    sheet.mergeCells(mergeAcross(1))
    const titleCell = sheet.getCell('A1')
    titleCell.value = companyName.toUpperCase()
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    sheet.getRow(1).height = 34

    // Row 2 — Document subtitle
    sheet.mergeCells(mergeAcross(2))
    const subtitleCell = sheet.getCell('A2')
    subtitleCell.value = 'Bulk Offer Upload Template'
    subtitleCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
    sheet.getRow(2).height = 22

    // Row 3 — Company contact line (whatever is available)
    const contactBits = [company.address, company.phone, company.email, company.website].filter(Boolean)
    sheet.mergeCells(mergeAcross(3))
    const contactCell = sheet.getCell('A3')
    contactCell.value = contactBits.join('  •  ') || ' '
    contactCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }
    contactCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    sheet.getRow(3).height = 16

    // Row 4 — spacer
    sheet.getRow(4).height = 6

    // Row 5 — Column headers
    const headerRowNumber = 5
    const headerRow = sheet.getRow(headerRowNumber)
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      cell.border = { bottom: { style: 'thin', color: { argb: ACCENT } } }
    })
    headerRow.height = 22

    // Row 6 — Sample data row
    const sample: Record<string, string> = {
      candidateId: '',
      candidateName: 'Alice Cooper',
      email: 'alice@example.com',
      jobId: 'JOB-001',
      designationId: 'DES-001',
      anticipatedStartDate: '2026-08-01',
      offerExpirationDate: '2026-08-21',
    }
    const sampleRow = sheet.getRow(headerRowNumber + 1)
    columns.forEach((col, i) => {
      const cell = sampleRow.getCell(i + 1)
      cell.value = sample[col.key] ?? ''
      cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } }
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    })

    // Column widths
    const widths = [22, 24, 30, 18, 18, 16, 16]
    columns.forEach((_, i) => { sheet.getColumn(i + 1).width = widths[i] || 20 })

    // Instructions block below the data
    const noteStart = headerRowNumber + 3
    sheet.mergeCells(`A${noteStart}:${colLetter(lastCol)}${noteStart}`)
    const noteHeader = sheet.getCell(`A${noteStart}`)
    noteHeader.value = 'INSTRUCTIONS'
    noteHeader.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND } }

    columns.forEach((col, idx) => {
      const r = noteStart + 1 + idx
      sheet.mergeCells(`A${r}:${colLetter(lastCol)}${r}`)
      const c = sheet.getCell(`A${r}`)
      c.value = `• ${col.header}: ${col.note}`
      c.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } }
      c.alignment = { wrapText: true, vertical: 'top' }
    })
    const deleteNoteRow = noteStart + 1 + columns.length
    sheet.mergeCells(`A${deleteNoteRow}:${colLetter(lastCol)}${deleteNoteRow}`)
    const delNote = sheet.getCell(`A${deleteNoteRow}`)
    delNote.value = '• Delete the sample row before uploading. Rows missing a valid email or designation will be flagged during validation.'
    delNote.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } }
    delNote.alignment = { wrapText: true, vertical: 'top' }

    const buffer = await workbook.xlsx.writeBuffer()
    const responseBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

    const safeName = companyName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'company'
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${safeName}_offer_upload_template_${timestamp}.xlsx`

    const excelResponse = new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    const corsResponse = withCors(excelResponse, origin)
    corsResponse.headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type')
    return corsResponse
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error) || 'Error generating template', 500), origin)
  }
}
