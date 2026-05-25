import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications?companyId=&status=&employeeId=&type=&department=&role=&authority=&dateFrom=&dateTo=&criticalOnly=&search=&page=&limit=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const companyId    = searchParams.get('companyId') ?? user.companyId
    const status       = searchParams.get('status')
    const employeeId   = searchParams.get('employeeId')
    const type         = searchParams.get('type')
    const department   = searchParams.get('department')
    const role         = searchParams.get('role')
    const authority    = searchParams.get('authority')
    const dateFrom     = searchParams.get('dateFrom')
    const dateTo       = searchParams.get('dateTo')
    const criticalOnly = searchParams.get('criticalOnly') === 'true'
    const search       = searchParams.get('search')
    const page         = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit        = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const now = new Date()
    const where: any = { companyId }
    if (status)   where.status = status
    if (type)     where.certificationType = { type }
    if (authority) where.certificationType = { ...(where.certificationType ?? {}), authority }

    // criticalOnly: expiring within 7 days
    if (criticalOnly) where.expiryDate = { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) }
    else {
      if (dateFrom || dateTo) {
        where.issueDate = {}
        if (dateFrom) where.issueDate.gte = new Date(dateFrom)
        if (dateTo)   where.issueDate.lte = new Date(dateTo)
      }
    }

    // STAFF can only see their own certifications
    if (user.role === 'STAFF') where.employeeId = user.userId
    else if (employeeId)       where.employeeId = employeeId

    // Department and role filter via employee relation
    if (department || role || search) {
      where.employee = {}
      if (department) where.employee.department = department
      if (role)       where.employee.role        = role
      if (search)     where.employee = {
        ...(where.employee ?? {}),
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName:  { contains: search, mode: 'insensitive' } },
          { email:     { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const [total, records] = await Promise.all([
      prisma.certificationRecord.count({ where }),
      prisma.certificationRecord.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, email: true, department: true, staffId: true, role: true },
          },
          certificationType: { select: { id: true, name: true, type: true, authority: true } },
          documents: { select: { id: true, fileName: true, fileUrl: true, fileType: true } },
        },
        orderBy: { issueDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const enriched = records.map(r => ({
      ...r,
      daysToExpiry: r.expiryDate
        ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000)
        : null,
    }))

    return withCors(ApiResponse.success({ records: enriched, total, page, limit }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/certifications — issue one or multiple certifications
// Body: { records: [{employeeId, certificationTypeId, issueDate, expiryDate?, duration?, certIdNumber?, issuedBy}] }
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { companyId, records } = body

    const cid = companyId ?? user.companyId
    if (!cid) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && cid !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)
    if (!Array.isArray(records) || records.length === 0)
      return withCors(ApiResponse.error('records array is required', 400), origin)

    // Cross-field validation: expiryDate must be after issueDate
    for (const r of records) {
      if (r.expiryDate && new Date(r.expiryDate) <= new Date(r.issueDate))
        return withCors(ApiResponse.error('expiryDate must be after issueDate', 422), origin)
    }

    const created = await prisma.$transaction(
      records.map((r: any) =>
        prisma.certificationRecord.create({
          data: {
            companyId: cid,
            employeeId: r.employeeId,
            certificationTypeId: r.certificationTypeId,
            certIdNumber: r.certIdNumber,
            issueDate: new Date(r.issueDate),
            expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
            duration: r.duration,
            status: 'Pending',
            issuedBy: r.issuedBy ?? user.userId,
          },
        }),
      ),
    )

    await prisma.trainingAuditLog.create({
      data: {
        companyId: cid,
        actorId: user.userId,
        action: 'ISSUED',
        entityType: 'certification_record',
        entityId: created[0]?.id ?? '',
        metadata: { count: created.length },
      },
    })

    return withCors(ApiResponse.success(created, `${created.length} certification(s) issued`, 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
