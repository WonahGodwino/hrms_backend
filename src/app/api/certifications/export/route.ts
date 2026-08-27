import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

async function handleExport(req: NextRequest, bodyOrParams: any) {
  const origin = req.headers.get('origin')
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

  const resolved = await resolveRequestCompanyId(user, bodyOrParams.companyId)
  if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
  const { companyId } = resolved
  const format           = (bodyOrParams.format ?? 'csv').toLowerCase()
  const scope            = bodyOrParams.scope ?? 'all'
  const idsParam         = bodyOrParams.ids ?? bodyOrParams.certification_ids

  const status           = bodyOrParams.status
  const department       = bodyOrParams.department
  const role             = bodyOrParams.role
  const certType         = bodyOrParams.certType ?? bodyOrParams.type
  const authority        = bodyOrParams.issuingAuthority ?? bodyOrParams.authority
  const search           = bodyOrParams.search?.trim()

  const where: any = { companyId }

  // Filter by explicit IDs if passed (comma-separated string or array)
  if (idsParam) {
    const selectedIds = Array.isArray(idsParam)
      ? idsParam
      : String(idsParam).split(',').map(s => s.trim()).filter(Boolean)

    if (selectedIds.length > 0) {
      where.id = { in: selectedIds }
    }
  } else {
    // Apply filters if no explicit IDs provided
    if (status) {
      where.status = status
    } else {
      where.status = { not: 'Archived' }
    }

    if (certType) {
      where.OR = [
        { certificationTypeId: certType },
        { certificationType: { name: { contains: certType, mode: 'insensitive' } } },
      ]
    }

    if (authority) {
      where.certificationType = {
        ...(where.certificationType ?? {}),
        authority: { contains: authority, mode: 'insensitive' },
      }
    }

    const employeeConds: any = {}
    if (department) employeeConds.department = department
    if (role)       employeeConds.role       = role

    if (Object.keys(employeeConds).length > 0) {
      where.employee = { ...(where.employee ?? {}), ...employeeConds }
    }

    if (search) {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { certIdNumber: { contains: search, mode: 'insensitive' } },
            { employee: { firstName: { contains: search, mode: 'insensitive' } } },
            { employee: { lastName: { contains: search, mode: 'insensitive' } } },
            { employee: { email: { contains: search, mode: 'insensitive' } } },
            { employee: { staffId: { contains: search, mode: 'insensitive' } } },
            { certificationType: { name: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ]
    }
  }

  const records = await prisma.certificationRecord.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, email: true, department: true, staffId: true, role: true } },
      certificationType: { select: { name: true, type: true, authority: true } },
    },
    orderBy: { issueDate: 'desc' },
  })

  const now = new Date()
  const rows = records.map(r => ({
    staffId:       r.employee.staffId ?? '',
    employeeName:  `${r.employee.firstName} ${r.employee.lastName}`,
    email:         r.employee.email,
    department:    r.employee.department ?? '',
    role:          r.employee.role ?? '',
    certification: r.certificationType.name,
    type:          r.certificationType.type,
    authority:     r.certificationType.authority,
    certIdNumber:  r.certIdNumber ?? '',
    issueDate:     r.issueDate.toISOString().split('T')[0],
    expiryDate:    r.expiryDate ? r.expiryDate.toISOString().split('T')[0] : 'No Expiry',
    daysToExpiry:  r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000) : 'N/A',
    status:        r.status,
    hasDocument:   r.hasDocument ? 'Yes' : 'No',
  }))

  // Export as XLSX / Excel
  if (format === 'xlsx' || format === 'excel') {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Certifications')

    worksheet.columns = [
      { header: 'Staff ID', key: 'staffId', width: 15 },
      { header: 'Employee Name', key: 'employeeName', width: 25 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Role', key: 'role', width: 18 },
      { header: 'Certification', key: 'certification', width: 30 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Issuing Authority', key: 'authority', width: 25 },
      { header: 'License/ID #', key: 'certIdNumber', width: 20 },
      { header: 'Issue Date', key: 'issueDate', width: 15 },
      { header: 'Expiry Date', key: 'expiryDate', width: 15 },
      { header: 'Days to Expiry', key: 'daysToExpiry', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Has Document', key: 'hasDocument', width: 15 },
    ]

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } }

    rows.forEach(r => worksheet.addRow(r))

    const buffer = await workbook.xlsx.writeBuffer()
    return new Response(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="certifications-export.xlsx"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  }

  // Export as CSV
  if (format === 'csv') {
    if (!rows.length) {
      const emptyCsv = 'Staff ID,Employee Name,Email,Department,Role,Certification,Type,Authority,License #,Issue Date,Expiry Date,Days to Expiry,Status,Has Document\n'
      return new Response(emptyCsv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="certifications-export.csv"',
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = Object.keys(rows[0]).join(',')
    const csvRows = rows.map(r => Object.values(r).map(escape).join(','))
    const csv     = [headers, ...csvRows].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="certifications-export.csv"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  }

  // Default / JSON return
  return withCors(ApiResponse.success({ rows, total: rows.length, format }), origin)
}

// GET /api/certifications/export
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const { searchParams } = new URL(req.url)
    const paramsObj: Record<string, string> = {}
    searchParams.forEach((val, key) => {
      paramsObj[key] = val
    })
    return await handleExport(req, paramsObj)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/certifications/export
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const body = await req.json().catch(() => ({}))
    return await handleExport(req, body)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
