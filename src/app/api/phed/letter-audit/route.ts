import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterAuditAccess } from '@/app/lib/phed/letter-access'
import { resolveLetterCompany } from '@/app/lib/phed/letter-service'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterAuditAccess(token)
    const companyId = resolveLetterCompany(user, new URL(req.url).searchParams.get('companyId'))
    if (!companyId) return withCors(ApiResponse.forbidden('No company in scope'), origin)

    const url = new URL(req.url)
    const action = url.searchParams.get('action') ?? undefined
    const take = Math.min(Number(url.searchParams.get('take') ?? 200) || 200, 500)

    const events = await (prisma as any).phedLetterAuditEvent.findMany({
      where: { companyId, ...(action ? { action } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, actorId: true, action: true, runId: true, detail: true, ip: true, createdAt: true },
    })

    return withCors(ApiResponse.success({ events }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
