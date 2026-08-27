// src/app/api/staff/records/export/route.ts
//
// GET — exports all (or the currently filtered subset of) a company's staff
// records as an Excel sheet, in the exact same column format as the staff
// upload sheet (backend/src/app/api/staff/bulk-edit/template/route.ts's
// TEMPLATE_COLUMNS), so it's directly re-uploadable after HR/staff mark
// corrections on it — not just a human-readable report.
//
// Scale note (3000+ staff): generation is synchronous and buffered
// (workbook.xlsx.writeBuffer()), not streamed. This is deliberate, not an
// oversight — backend/src/app/lib/cors.ts's withCors() (wrapped around
// every route, including this one) already reads the full response body
// into memory via response.arrayBuffer() before forwarding it, so a
// streaming ExcelJS writer would add real complexity for zero net memory
// benefit; the buffering happens at the CORS layer regardless. There's also
// no serverless timeout risk here — this app runs as a long-running Node
// server (see the same reasoning in backend/src/app/api/staff/bulk-edit/upload/route.ts
// and backend/src/app/api/offer-letters/bulk-create/upload/route.ts). At
// 3000 rows × 10 short text columns, a single narrow `select` query plus
// sheet construction is a sub-second, low-single-digit-MB operation — the
// real risks at this scale (N+1 queries, over-fetched relations) are
// avoided by design below, not by streaming.
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const TEMPLATE_COLUMNS = [
  { header: 'staffId', key: 'staffId', width: 20 },
  { header: 'email', key: 'email', width: 25 },
  { header: 'firstName', key: 'firstName', width: 15 },
  { header: 'lastName', key: 'lastName', width: 15 },
  { header: 'department', key: 'department', width: 20 },
  { header: 'position', key: 'position', width: 20 },
  { header: 'phone', key: 'phone', width: 15 },
  { header: 'bankName', key: 'bankName', width: 20 },
  { header: 'accountNumber', key: 'accountNumber', width: 20 },
  { header: 'bvn', key: 'bvn', width: 15 },
]

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'MANAGER', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department')
    const search = searchParams.get('search')
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const companyId = searchParams.get('companyId')

    // Same access-resolution as GET /api/staff/records — this is an export
    // of the same data that route lists, so it's gated identically.
    const where: any = {
      isActive: includeInactive ? undefined : true,
      company: { archived: 0 },
    }

    if (!companyId) {
      if (user.role === 'SUPER_ADMIN' && user.companyId) {
        where.companyId = user.companyId
      } else {
        return withCors(ApiResponse.error('Company ID is required. Please select a company.', 400), origin)
      }
    } else {
      if (user.role !== 'SUPER_ADMIN') {
        const hasAccess = await prisma.userCompany.findFirst({
          where: { userId: user.userId, companyId },
          select: { id: true },
        })
        if (!hasAccess && companyId !== user.companyId) {
          return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
        }
      }
      where.companyId = companyId
    }

    if (department) {
      where.department = { contains: department, mode: 'insensitive' }
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const company = await prisma.company.findFirst({ where: { id: where.companyId }, select: { companyName: true } })

    const staff = await prisma.staffRecord.findMany({
      where,
      orderBy: { staffId: 'asc' },
      select: {
        staffId: true,
        email: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        phone: true,
        bankName: true,
        accountNumber: true,
        bvn: true,
      },
    })

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Staff Records')

    // Assigning .columns writes the header values straight into row 1 —
    // nothing should be added to the sheet before this line.
    worksheet.columns = TEMPLATE_COLUMNS

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    staff.forEach((s, index) => {
      const row = worksheet.addRow({
        staffId: s.staffId,
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName,
        department: s.department || '',
        position: s.position,
        phone: s.phone || '',
        bankName: s.bankName || '',
        accountNumber: s.accountNumber || '',
        bvn: s.bvn || '',
      })
      row.alignment = { vertical: 'middle', horizontal: 'left' }
      if (index % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      }
    })

    const buffer = await workbook.xlsx.writeBuffer()

    const safeCompanyName = (company?.companyName || 'company').replace(/[^a-zA-Z0-9]+/g, '_')
    const dateStamp = new Date().toISOString().slice(0, 10)

    const response = new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="staff-records-${safeCompanyName}-${dateStamp}.xlsx"`,
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
