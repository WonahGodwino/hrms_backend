import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/certifications/compliance?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const now = new Date()

    const [total, valid, expiringSoon, expired, pending] = await Promise.all([
      prisma.certificationRecord.count({ where: { companyId } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Valid' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expiring Soon' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expired' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Pending' } }),
    ])

    // Department breakdown
    const allRecords = await prisma.certificationRecord.findMany({
      where: { companyId },
      select: { status: true, employee: { select: { department: true } } },
    })

    const deptMap: Record<string, { total: number; compliant: number }> = {}
    for (const r of allRecords) {
      const dept = r.employee.department ?? 'Unknown'
      if (!deptMap[dept]) deptMap[dept] = { total: 0, compliant: 0 }
      deptMap[dept].total++
      if (r.status === 'Valid') deptMap[dept].compliant++
    }

    const byDepartment = Object.entries(deptMap).map(([department, { total, compliant }]) => ({
      department, total, compliant,
      complianceRate: total > 0 ? Math.round((compliant / total) * 100) : 0,
    }))

    return withCors(
      ApiResponse.success({
        kpis: { total, valid, expiringSoon, expired, pending },
        complianceRate: total > 0 ? Math.round((valid / total) * 100) : 0,
        byDepartment,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
