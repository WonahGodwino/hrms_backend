import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterAuditAccess } from '@/app/lib/phed/letter-access'
import { cleanupExpiredLetterFiles, resolveLetterCompany, resumeStuckLetterRuns, runProgress } from '@/app/lib/phed/letter-service'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterAuditAccess(token)
    cleanupExpiredLetterFiles().catch((e) => console.warn('[letter] cleanup sweep failed:', e))
    resumeStuckLetterRuns().catch((e) => console.warn('[letter] resume sweep failed:', e))

    const run = await (prisma as any).phedLetterRun.findUnique({
      where: { id: params.id },
      select: {
        id: true, companyId: true, operatorId: true, status: true, counts: true, runInputs: true,
        sourceFileName: true, templateVersion: true, createdAt: true, completedAt: true, filesExpireAt: true,
      },
    })
    if (!run) return withCors(ApiResponse.notFound('Run not found'), origin)

    const companyId = resolveLetterCompany(user, new URL(req.url).searchParams.get('companyId'))
    if (!companyId || run.companyId !== companyId) return withCors(ApiResponse.notFound('Run not found'), origin)
    if (user.role === 'HR' && run.operatorId !== user.userId) return withCors(ApiResponse.notFound('Run not found'), origin)

    const progress = await runProgress(run.id)
    return withCors(ApiResponse.success({ run, progress }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
