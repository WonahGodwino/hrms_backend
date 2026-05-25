import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/certifications/kpis?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const [total, valid, expiringSoon, expired, pending] = await Promise.all([
      prisma.certificationRecord.count({ where: { companyId } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Valid' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expiring Soon' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Expired' } }),
      prisma.certificationRecord.count({ where: { companyId, status: 'Pending' } }),
    ])

    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

    return withCors(
      ApiResponse.success({
        total,
        valid:        { count: valid,        pct: pct(valid) },
        expiringSoon: { count: expiringSoon,  pct: pct(expiringSoon) },
        expired:      { count: expired,       pct: pct(expired) },
        pending:      { count: pending,       pct: pct(pending) },
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
