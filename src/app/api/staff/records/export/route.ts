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
import { assertExportsAllowed } from '@/app/lib/trial/guard'
import ExcelJS from 'exceljs'
import { STAFF_GROSS_COLUMN, STAFF_PENSION_COLUMNS } from '@/app/lib/staff/pension-fields'
import { GROSS_SYSTEM_FIELD } from '@/app/lib/payroll/generation/field-resolver'
import { NSITF_IDENTITY_COLUMNS, STAFF_HIRE_DATE_COLUMN } from '@/app/lib/staff/nsitf-identity-fields'
import { XLSX_MIME, writeStyledTable, buildSubtitle, confidentialFooter, safeFileName, attachmentDisposition } from '@/app/lib/excel/sheet-theme'

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
  STAFF_GROSS_COLUMN,
  ...STAFF_PENSION_COLUMNS,
  STAFF_HIRE_DATE_COLUMN,
  ...NSITF_IDENTITY_COLUMNS,
]

// Reference-only columns after the re-uploadable ones above. The upload
// parsers read columns by header name, so these are ignored on re-upload.
const EXTRA_COLUMNS = [
  { header: 'pensionContributionType', key: 'pensionContributionType', width: 22, align: 'left' as const },
  { header: 'pensionEmployerCode', key: 'pensionEmployerCode', width: 20, align: 'left' as const },
  { header: 'voluntaryPensionEmployee', key: 'voluntaryPensionEmployee', width: 22, align: 'left' as const },
  { header: 'voluntaryPensionEmployer', key: 'voluntaryPensionEmployer', width: 22, align: 'left' as const },
  { header: 'otherPensionContribution', key: 'otherPensionContribution', width: 22, align: 'left' as const },
  { header: 'location', key: 'location', width: 20, align: 'left' as const },
  { header: 'manager', key: 'manager', width: 24, align: 'left' as const },
  { header: 'role', key: 'role', width: 12, align: 'left' as const },
  { header: 'status', key: 'status', width: 12, align: 'left' as const },
  { header: 'registered', key: 'registered', width: 12, align: 'left' as const },
]

const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
const fmtNum = (v: unknown) => (v === null || v === undefined ? '' : Number(v))

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

    // Free trial: exports are off for the whole trial.
    await assertExportsAllowed(where.companyId)

    const company = await prisma.company.findFirst({ where: { id: where.companyId }, select: { companyName: true } })

    const staff = await prisma.staffRecord.findMany({
      where,
      orderBy: { staffId: 'asc' },
      select: {
        id: true,
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
        rsaPin: true,
        pfaCode: true,
        pensionContributionType: true,
        pensionEmployerCode: true,
        voluntaryPensionEmployee: true,
        voluntaryPensionEmployer: true,
        otherPensionContribution: true,
        hireDate: true,
        location: true,
        role: true,
        isActive: true,
        isRegistered: true,
        middleName: true,
        gender: true,
        dateOfBirth: true,
        maritalStatus: true,
        stateOfOrigin: true,
        lgaOfOrigin: true,
        townOfOrigin: true,
        alternatePhone: true,
        nin: true,
        stateOfIssuance: true,
        residentialAddress: true,
        numberOfPrimaryDependants: true,
        locationRecord: { select: { name: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
    })

    // Gross lives on the Compensation profile, not the staff record. One batched lookup, no per-row queries.
    const profiles = await prisma.staffPayrollProfile.findMany({
      where: { staffId: { in: staff.map((s) => s.id) } },
      select: { staffId: true, values: true },
    })
    const grossByStaff = new Map<string, number>()
    for (const p of profiles) {
      const g = Number((p.values as Record<string, unknown> | null)?.[GROSS_SYSTEM_FIELD])
      if (Number.isFinite(g)) grossByStaff.set(p.staffId, g)
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Staff Records')

    // The header row sits on row 4 under the title band; staff/upload and
    // staff/bulk-edit/upload locate it with findHeaderRow(), so the file stays re-uploadable.
    writeStyledTable(worksheet, {
      title: 'Staff Records',
      subtitle: buildSubtitle([company?.companyName, `${staff.length} staff`]),
      columns: [...TEMPLATE_COLUMNS, ...EXTRA_COLUMNS].map((c) => ({ ...c, align: 'left' as const })),
      rows: staff.map((s) => ({
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
        gross: grossByStaff.get(s.id) ?? '',
        rsaPin: s.rsaPin || '',
        pfaCode: s.pfaCode || '',
        hireDate: fmtDate(s.hireDate),
        middleName: s.middleName || '',
        gender: s.gender || '',
        dateOfBirth: fmtDate(s.dateOfBirth),
        maritalStatus: s.maritalStatus || '',
        stateOfOrigin: s.stateOfOrigin || '',
        lgaOfOrigin: s.lgaOfOrigin || '',
        townOfOrigin: s.townOfOrigin || '',
        alternatePhone: s.alternatePhone || '',
        nin: s.nin || '',
        stateOfIssuance: s.stateOfIssuance || '',
        residentialAddress: s.residentialAddress || '',
        numberOfPrimaryDependants: s.numberOfPrimaryDependants ?? '',
        pensionContributionType: s.pensionContributionType || '',
        pensionEmployerCode: s.pensionEmployerCode || '',
        voluntaryPensionEmployee: fmtNum(s.voluntaryPensionEmployee),
        voluntaryPensionEmployer: fmtNum(s.voluntaryPensionEmployer),
        otherPensionContribution: fmtNum(s.otherPensionContribution),
        location: s.locationRecord?.name || s.location || '',
        manager: s.manager ? `${s.manager.firstName} ${s.manager.lastName}`.trim() : '',
        role: s.role,
        status: s.isActive ? 'Active' : 'Inactive',
        registered: s.isRegistered ? 'Yes' : 'No',
      })),
      emptyMessage: 'No staff records match the selected filters',
      footer: confidentialFooter(company?.companyName),
    })

    const buffer = await workbook.xlsx.writeBuffer()

    const dateStamp = new Date().toISOString().slice(0, 10)
    const fileName = `Staff Records (${safeFileName(company?.companyName || 'Company')}) ${dateStamp}.xlsx`

    const response = new NextResponse(buffer as any, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': attachmentDisposition(fileName),
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
