import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/expiry-dashboard?range=30d&department=&search=
// Returns expiring soon, critical, expired records and aggregated stats
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const range     = searchParams.get('range') ?? '30d'
    const department = searchParams.get('department')
    const search     = searchParams.get('search')?.trim()

    const now = new Date()
    let rangeDays = 30
    if (range.endsWith('d')) rangeDays = parseInt(range.replace('d', ''), 10) || 30

    const rangeDate = new Date(now.getTime() + rangeDays * 86_400_000)
    const critical7Date = new Date(now.getTime() + 7 * 86_400_000)

    const baseWhere: any = {
      companyId,
      status: { not: 'Archived' },
    }

    if (department) {
      baseWhere.employee = { department }
    }

    if (search) {
      baseWhere.AND = [
        ...(baseWhere.AND ?? []),
        {
          OR: [
            { certIdNumber: { contains: search, mode: 'insensitive' } },
            { employee: { firstName: { contains: search, mode: 'insensitive' } } },
            { employee: { lastName: { contains: search, mode: 'insensitive' } } },
            { employee: { email: { contains: search, mode: 'insensitive' } } },
            { certificationType: { name: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ]
    }

    // Query counts for stats
    const [expiring30Count, critical7Count, expiredCount, validCount, totalRecordsCount] = await Promise.all([
      prisma.certificationRecord.count({
        where: {
          ...baseWhere,
          expiryDate: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) },
        },
      }),
      prisma.certificationRecord.count({
        where: {
          ...baseWhere,
          expiryDate: { gte: now, lte: critical7Date },
        },
      }),
      prisma.certificationRecord.count({
        where: {
          ...baseWhere,
          OR: [
            { status: 'Expired' },
            { expiryDate: { lt: now } },
          ],
        },
      }),
      prisma.certificationRecord.count({
        where: { ...baseWhere, status: 'Valid' },
      }),
      prisma.certificationRecord.count({ where: baseWhere }),
    ])

    // Fetch items matching expired or expiring within specified range
    const records = await prisma.certificationRecord.findMany({
      where: {
        ...baseWhere,
        OR: [
          { status: 'Expired' },
          { expiryDate: { lt: now } },
          { expiryDate: { gte: now, lte: rangeDate } },
          { status: 'Expiring Soon' },
        ],
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, email: true, department: true, staffId: true, role: true },
        },
        certificationType: { select: { id: true, name: true, type: true, authority: true } },
        documents: { select: { id: true, fileName: true, fileUrl: true } },
      },
      orderBy: { expiryDate: 'asc' },
    })

    const items = records.map(r => {
      const daysToExpiry = r.expiryDate
        ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000)
        : null

      let derivedStatus = r.status
      if (r.status !== 'Archived') {
        if (daysToExpiry !== null && daysToExpiry < 0) derivedStatus = 'Expired'
        else if (daysToExpiry !== null && daysToExpiry <= 30) derivedStatus = 'Expiring Soon'
      }

      return {
        id: r.id,
        certIdNumber: r.certIdNumber,
        issueDate: r.issueDate.toISOString().split('T')[0],
        expiryDate: r.expiryDate ? r.expiryDate.toISOString().split('T')[0] : null,
        daysToExpiry,
        status: derivedStatus,
        isCritical: daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 7,
        hasDocument: r.hasDocument || r.documents.length > 0,
        employee: {
          id: r.employee.id,
          name: `${r.employee.firstName} ${r.employee.lastName}`,
          email: r.employee.email,
          department: r.employee.department,
          staffId: r.employee.staffId,
          role: r.employee.role,
        },
        certification: {
          id: r.certificationType.id,
          name: r.certificationType.name,
          type: r.certificationType.type,
          authority: r.certificationType.authority,
        },
      }
    })

    const completionRate = totalRecordsCount > 0
      ? Math.round((validCount / totalRecordsCount) * 100)
      : 0

    return withCors(
      ApiResponse.success({
        items,
        stats: {
          expiring30: expiring30Count,
          critical7: critical7Count,
          expired: expiredCount,
          valid: validCount,
          total: totalRecordsCount,
          completionRate,
        },
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
