import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/analytics/certifications/departments?companyId=
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

    const records = await prisma.certificationRecord.findMany({
      where: { companyId },
      select: {
        status: true,
        certificationType: { select: { type: true } },
        employee:          { select: { department: true } },
      },
    })

    const deptMap: Record<string, { total: number; valid: number; expiringSoon: number; expired: number; pending: number }> = {}
    for (const r of records) {
      const dept = r.employee.department ?? 'Unknown'
      if (!deptMap[dept]) deptMap[dept] = { total: 0, valid: 0, expiringSoon: 0, expired: 0, pending: 0 }
      deptMap[dept].total++
      if (r.status === 'Valid')          deptMap[dept].valid++
      if (r.status === 'Expiring Soon')  deptMap[dept].expiringSoon++
      if (r.status === 'Expired')        deptMap[dept].expired++
      if (r.status === 'Pending')        deptMap[dept].pending++
    }

    const departments = Object.entries(deptMap).map(([department, counts]) => ({
      department,
      ...counts,
      complianceRate: counts.total > 0 ? Math.round((counts.valid / counts.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total)

    return withCors(ApiResponse.success({ departments }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
