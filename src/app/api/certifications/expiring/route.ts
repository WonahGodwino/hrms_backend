import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/certifications/expiring?companyId=&days_threshold=30&critical_only=false
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const daysThreshold  = parseInt(searchParams.get('days_threshold') ?? '30')
    const criticalOnly   = searchParams.get('critical_only') === 'true'

    const now       = new Date()
    const threshold = new Date(now.getTime() + daysThreshold * 86_400_000)
    const critical  = new Date(now.getTime() + 7 * 86_400_000)

    const records = await prisma.certificationRecord.findMany({
      where: {
        companyId,
        expiryDate: {
          gte: now,
          lte: criticalOnly ? critical : threshold,
        },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true, department: true, staffId: true } },
        certificationType: { select: { id: true, name: true, type: true, authority: true } },
      },
      orderBy: { expiryDate: 'asc' },
    })

    const enriched = records.map(r => ({
      ...r,
      daysToExpiry: r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000) : null,
    }))

    return withCors(ApiResponse.success({ records: enriched, total: enriched.length, daysThreshold }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
