// src/app/api/staff/bulk-edit/template/route.ts
//
// POST — given a list of staff ids, generates an Excel sheet mirroring the
// staff upload template, prefilled with each selected staff's staffId and
// email so HR/Admin only has to fill in the fields they actually want to
// change. The sheet is fully editable; staffId is used purely as the lookup
// key on re-upload and is never itself written back, so editing it here just
// changes which record the row matches (or fails to match) rather than
// renaming anything.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { STAFF_PENSION_COLUMNS, addPfaDropdown } from '@/app/lib/staff/pension-fields'
import { NSITF_IDENTITY_COLUMNS, STAFF_HIRE_DATE_COLUMN } from '@/app/lib/staff/nsitf-identity-fields'
import { writeStyledTable, buildSubtitle, confidentialFooter, attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

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
  ...STAFF_PENSION_COLUMNS,
  STAFF_HIRE_DATE_COLUMN,
  ...NSITF_IDENTITY_COLUMNS,
]

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const body = await request.json().catch(() => ({}))
    const { companyId, staffIds } = body as { companyId?: string; staffIds?: string[] }

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    if (authUser.role === 'HR') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId, role: { in: ['HR', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have HR access for this company', 403), origin)
      }
    } else if (authUser.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId, role: { in: ['ADMIN', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
      }
    }

    if (!Array.isArray(staffIds) || staffIds.length === 0) {
      return withCors(ApiResponse.error('At least one staff member must be selected', 400), origin)
    }

    const company = await prisma.company.findFirst({ where: { id: companyId, archived: 0 }, select: { id: true, companyName: true } })
    if (!company) {
      return withCors(ApiResponse.error('Company not found or is archived', 404), origin)
    }

    const staff = await prisma.staffRecord.findMany({
      where: { companyId, id: { in: staffIds }, isActive: true },
      select: { id: true, staffId: true, email: true },
      orderBy: { staffId: 'asc' },
    })

    if (staff.length === 0) {
      return withCors(ApiResponse.error('None of the selected staff records could be found', 404), origin)
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Staff Bulk Edit')

    // Header on row 4 under the title band; bulk-edit/upload finds it by scanning for staffId.
    const columns = TEMPLATE_COLUMNS.map((c) => ({ ...c, align: 'left' as const }))
    const { firstDataRow, lastDataRow } = writeStyledTable(worksheet, {
      title: 'Staff Bulk Edit',
      subtitle: buildSubtitle([company.companyName, `${staff.length} staff selected`, 'Fill only the columns you want to change']),
      columns,
      rows: staff.map((s) => ({ staffId: s.staffId, email: s.email })),
      autoFilter: false,
      footer: confidentialFooter(),
    })

    const pfaColumn = columns.findIndex((c) => c.key === 'pfaCode') + 1
    if (pfaColumn > 0 && lastDataRow >= firstDataRow) {
      await addPfaDropdown(workbook, worksheet, { column: pfaColumn, firstRow: firstDataRow, lastRow: lastDataRow, companyId })
    }

    const buffer = await workbook.xlsx.writeBuffer()

    const response = new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(`Staff Bulk Edit (${safeFileName(company.companyName)}).xlsx`),
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
