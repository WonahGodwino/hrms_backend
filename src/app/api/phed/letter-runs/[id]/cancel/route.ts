import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterOperatorAccess } from '@/app/lib/phed/letter-access'
import { auditLetterEvent, clientIp, resolveLetterCompany, retentionExpiry } from '@/app/lib/phed/letter-service'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterOperatorAccess(token)

    const body = await req.json().catch(() => ({}))
    const run = await (prisma as any).phedLetterRun.findUnique({ where: { id: params.id } })
    if (!run) return withCors(ApiResponse.notFound('Run not found'), origin)

    const companyId = resolveLetterCompany(user, body?.companyId)
    if (!companyId || run.companyId !== companyId) return withCors(ApiResponse.notFound('Run not found'), origin)
    if (user.role === 'HR' && run.operatorId !== user.userId) return withCors(ApiResponse.notFound('Run not found'), origin)

    if (run.status !== 'GENERATING') {
      return withCors(ApiResponse.error('Run is not currently generating.', 409), origin)
    }

    await (prisma as any).phedLetterRun.update({ where: { id: params.id }, data: { status: 'CANCELLED', completedAt: new Date(), filesExpireAt: retentionExpiry() } })
    await auditLetterEvent(companyId, user.userId, 'CANCEL', params.id, 'Run cancelled; already-generated letters are kept', clientIp(req.headers))

    return withCors(ApiResponse.success({ runId: params.id, status: 'CANCELLED' }, 'Run cancelled'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
