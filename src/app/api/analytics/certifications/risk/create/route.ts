import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/analytics/certifications/risk — log a new risk signal.
// Body: { type?, title?, description?, severity?, department?, affectedUsers?, primaryAction?, companyId? }
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const title = (body.title ?? '').toString().trim()
    if (!title) return withCors(ApiResponse.error('Risk title is required', 400), origin)

    const severity = ['CRITICAL', 'WARNING'].includes(body.severity) ? body.severity : 'WARNING'

    const risk = await prisma.riskItem.create({
      data: {
        companyId,
        code: `RISK-${Date.now()}`,
        type: body.type ?? 'Compliance',
        title,
        description: body.description ?? null,
        severity,
        department: body.department ?? null,
        affectedUsers: body.affectedUsers ?? undefined,
        primaryAction: body.primaryAction ?? 'view',
      },
    })

    return withCors(ApiResponse.success(risk, 'Risk logged successfully', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
