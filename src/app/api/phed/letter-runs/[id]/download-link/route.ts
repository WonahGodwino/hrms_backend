import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterOperatorAccess } from '@/app/lib/phed/letter-access'
import { auditLetterEvent, clientIp, isRunExpired, resolveLetterCompany } from '@/app/lib/phed/letter-service'
import { signLetterDownloadToken } from '@/app/lib/phed/letter-download-token'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST — issue a short-lived (15 min) signed download link for a finished run.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterOperatorAccess(token)

    const body = await req.json().catch(() => ({}))
    const run = await (prisma as any).phedLetterRun.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, operatorId: true, status: true, filesExpireAt: true },
    })
    if (!run) return withCors(ApiResponse.notFound('Run not found'), origin)

    const companyId = resolveLetterCompany(user, body?.companyId)
    if (!companyId || run.companyId !== companyId) return withCors(ApiResponse.notFound('Run not found'), origin)
    if (user.role === 'HR' && run.operatorId !== user.userId) return withCors(ApiResponse.notFound('Run not found'), origin)

    if (!['COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELLED'].includes(run.status)) {
      return withCors(ApiResponse.error('Run has not finished generating.', 409), origin)
    }
    if (isRunExpired(run)) {
      return withCors(ApiResponse.error('Letter files for this run have expired.', 410), origin)
    }

    const { token: downloadToken, expiresIn } = signLetterDownloadToken(run.id, run.companyId)
    await auditLetterEvent(companyId, user.userId, 'DOWNLOAD_LINK_ISSUED', run.id, `expiresIn=${expiresIn}s`, clientIp(req.headers))

    return withCors(ApiResponse.success({ token: downloadToken, expiresIn }, 'Download link issued'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
