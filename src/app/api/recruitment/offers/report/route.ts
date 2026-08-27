// GET /api/recruitment/offers/report
// Streams a branded XLSX report of the company's offers (optionally filtered by
// status/scope). Used by the "Export Report" action on the Offers dashboard.
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved (Ready to Send)',
  AWAITING_SIGNATURE: 'Awaiting Signature',
  SENT: 'Dispatched — Awaiting Signature',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  REJECTED: 'Revision Requested',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
}

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    // Optional filters: status, and a "scope" of pending|dispatched matching the tabs.
    const status = searchParams.get('status')
    const scope = (searchParams.get('scope') || '').toLowerCase()
    const where: any = { companyId, archived: 0 }
    if (status && STATUS_LABEL[status]) where.status = status
    else if (scope === 'approval') where.status = { in: ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'] }
    else if (scope === 'ready' || scope === 'pending') where.status = { in: ['APPROVED'] }
    else if (scope === 'dispatched') where.status = { in: ['SENT', 'AWAITING_SIGNATURE', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'] }

    const [company, offers] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true, tradingName: true } }),
      prisma.offer.findMany({
        where,
        include: {
          candidate: { select: { firstName: true, lastName: true, email: true } },
          application: { select: { job: { select: { title: true, department: true } } } },
          approvals: { orderBy: { step: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ])
    const companyName = company?.tradingName || company?.companyName || 'Your Company'

    const workbook = new ExcelJS.Workbook()
    workbook.creator = companyName
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('Offers Report', { views: [{ state: 'frozen', ySplit: 4 }] })

    const columns = [
      { header: 'Candidate', width: 26 },
      { header: 'Email', width: 30 },
      { header: 'Role', width: 24 },
      { header: 'Department', width: 20 },
      { header: 'Grade', width: 14 },
      { header: 'Base Salary', width: 16 },
      { header: 'Currency', width: 10 },
      { header: 'Status', width: 28 },
      { header: 'Approved By', width: 22 },
      { header: 'Approved On', width: 16 },
      { header: 'Dispatched On', width: 16 },
      { header: 'Response Deadline', width: 18 },
      { header: 'Created On', width: 16 },
    ]
    const lastCol = columns.length
    const colLetter = (n: number) => String.fromCharCode(64 + n)
    const BRAND = 'FF0F172A', ACCENT = 'FF2563EB', HEADER_BG = 'FF1E293B'

    sheet.mergeCells(`A1:${colLetter(lastCol)}1`)
    const title = sheet.getCell('A1')
    title.value = `${companyName.toUpperCase()} — OFFERS REPORT`
    title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
    title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    sheet.getRow(1).height = 30

    sheet.mergeCells(`A2:${colLetter(lastCol)}2`)
    const sub = sheet.getCell('A2')
    sub.value = `Generated ${new Date().toLocaleString('en-GB')} · ${offers.length} offer(s)`
    sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFFFFFFF' } }
    sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
    sheet.getRow(2).height = 18
    sheet.getRow(3).height = 6

    const headerRow = sheet.getRow(4)
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      cell.border = { bottom: { style: 'thin', color: { argb: ACCENT } } }
      sheet.getColumn(i + 1).width = col.width
    })
    headerRow.height = 20

    offers.forEach((o, idx) => {
      const meta: any = (o.metadata && typeof o.metadata === 'object') ? o.metadata : {}
      const deadline = meta.responseDeadline ? new Date(meta.responseDeadline) : null
      // Latest completed approval (name + date) for the record.
      const approvedSteps = ((o as any).approvals || []).filter((s: any) => s.status === 'APPROVED' && s.actedAt)
      const lastApproved = approvedSteps.length
        ? approvedSteps.reduce((a: any, b: any) => (new Date(a.actedAt) > new Date(b.actedAt) ? a : b))
        : null
      const row = sheet.getRow(5 + idx)
      const values = [
        `${o.candidate?.firstName || ''} ${o.candidate?.lastName || ''}`.trim() || '—',
        o.candidate?.email || '',
        o.application?.job?.title || '',
        o.application?.job?.department || '',
        o.gradeName || '',
        o.salary != null ? Number(o.salary) : '',
        o.currency || 'NGN',
        STATUS_LABEL[o.status] || o.status,
        lastApproved?.approverName || '',
        fmtDate(lastApproved?.actedAt),
        fmtDate(o.dispatchedAt),
        fmtDate(deadline),
        fmtDate(o.createdAt),
      ]
      values.forEach((v, i) => {
        const cell = row.getCell(i + 1)
        cell.value = v as any
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1F2937' } }
        cell.alignment = { vertical: 'middle', horizontal: i === 5 ? 'right' : 'left', indent: 1 }
        if (i === 5 && typeof v === 'number') cell.numFmt = '#,##0'
        if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
      row.height = 18
    })

    if (offers.length === 0) {
      sheet.mergeCells(`A5:${colLetter(lastCol)}5`)
      const empty = sheet.getCell('A5')
      empty.value = 'No offers match this report.'
      empty.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }
      empty.alignment = { vertical: 'middle', horizontal: 'center' }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const responseBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    const safeName = companyName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'company'
    const filename = `${safeName}_offers_report_${new Date().toISOString().split('T')[0]}.xlsx`

    const res = new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    const cors = await withCors(res, origin)
    cors.headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type')
    return cors
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error) || 'Error generating report', 500), origin)
  }
}
