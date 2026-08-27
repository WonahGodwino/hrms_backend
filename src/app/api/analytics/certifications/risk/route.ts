import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/certifications/risk?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const now = new Date()
    const sevenDays = new Date(now.getTime() + 7 * 86_400_000)

    const [expired, criticalExpiring, overdueTraining, totalRiskItems] = await Promise.all([
      prisma.certificationRecord.count({ where: { companyId, status: 'Expired' } }),
      prisma.certificationRecord.count({ where: { companyId, expiryDate: { gte: now, lte: sevenDays } } }),
      prisma.participantProgress.count({
        where: { companyId, trainingStatus: { in: ['NOT STARTED', 'IN PROGRESS'] }, dueDate: { lt: now } },
      }),
      prisma.riskItem.count({ where: { companyId, status: 'Active' } }),
    ])

    // Top expired cert types
    const expiredRecords = await prisma.certificationRecord.findMany({
      where: { companyId, status: 'Expired' },
      include: { certificationType: { select: { name: true, type: true } }, employee: { select: { department: true } } },
      take: 20,
      orderBy: { expiryDate: 'asc' },
    })

    const riskByType: Record<string, number> = {}
    const riskByDept: Record<string, number> = {}
    for (const r of expiredRecords) {
      const type = r.certificationType.type
      const dept = r.employee.department
      riskByType[type] = (riskByType[type] ?? 0) + 1
      const deptKey = dept ?? "Unknown"
      riskByDept[deptKey] = (riskByDept[deptKey] ?? 0) + 1
    }

    return withCors(
      ApiResponse.success({
        summary: { expired, criticalExpiring, overdueTraining, totalRiskItems },
        riskByType: Object.entries(riskByType).map(([type, count]) => ({ type, count })),
        riskByDepartment: Object.entries(riskByDept).map(([dept, count]) => ({ department: dept, count })).sort((a, b) => b.count - a.count),
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
