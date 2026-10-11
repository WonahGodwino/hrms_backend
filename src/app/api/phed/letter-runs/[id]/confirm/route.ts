import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterOperatorAccess } from '@/app/lib/phed/letter-access'
import { auditLetterEvent, clientIp, generateRun, resolveLetterCompany } from '@/app/lib/phed/letter-service'

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

    if (run.status !== 'AWAITING_CONFIRMATION') {
      return withCors(ApiResponse.error('Run is not awaiting confirmation.', 409), origin)
    }
    if (body?.mode !== 'valid_only') {
      return withCors(ApiResponse.error('mode must be "valid_only".', 400), origin)
    }

    await (prisma as any).phedLetterRun.update({ where: { id: params.id }, data: { status: 'GENERATING' } })
    await (prisma as any).phedLetterRunRow.updateMany({
      where: { runId: params.id, status: 'PENDING' },
      data: { status: 'QUEUED' },
    })

    await auditLetterEvent(companyId, user.userId, 'CONFIRM_GENERATE', params.id, 'Generation confirmed (valid rows only)', clientIp(req.headers))

    // Fire-and-forget background generation (DB-backed progress, poll via GET /letter-runs/:id).
    generateRun(params.id).catch((e) => {
      console.error('[letter-run] generation failed:', e)
    })

    return withCors(ApiResponse.success({ runId: params.id, status: 'GENERATING' }, 'Generation started'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
