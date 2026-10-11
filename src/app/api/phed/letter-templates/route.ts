import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterAdminAccess } from '@/app/lib/phed/letter-access'
import { auditLetterEvent, clientIp, resolveLetterCompany } from '@/app/lib/phed/letter-service'
import { validateTemplateTokens, extractTokens } from '@/app/lib/phed/letter-engine/token-map'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterAdminAccess(token)
    const companyId = resolveLetterCompany(user, new URL(req.url).searchParams.get('companyId'))
    if (!companyId) return withCors(ApiResponse.forbidden('No company in scope'), origin)

    const templates = await (prisma as any).phedLetterTemplate.findMany({
      where: { companyId },
      orderBy: { version: 'desc' },
      select: { id: true, type: true, version: true, signatoryName: true, signatoryTitle: true, body: true, letterhead: true, createdAt: true, createdById: true },
    })

    const latest = templates[0] ?? null
    return withCors(ApiResponse.success({ latest, versions: templates }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterAdminAccess(token)

    const body = await req.json()
    const companyId = resolveLetterCompany(user, body?.companyId)
    if (!companyId) return withCors(ApiResponse.forbidden('No company in scope'), origin)

    const bodyText = typeof body?.body === 'string' ? body.body : ''
    const letterhead = typeof body?.letterhead === 'string' ? body.letterhead : ''
    const signatoryName = typeof body?.signatoryName === 'string' ? body.signatoryName.trim() : ''
    const signatoryTitle = typeof body?.signatoryTitle === 'string' ? body.signatoryTitle.trim() : ''

    if (!bodyText.trim()) return withCors(ApiResponse.error('body is required', 400), origin)
    if (!signatoryName || !signatoryTitle) return withCors(ApiResponse.error('signatoryName and signatoryTitle are required', 400), origin)

    const check = validateTemplateTokens(bodyText)
    if (!check.ok) {
      return withCors(ApiResponse.error(`Template contains unknown token(s): ${check.unknown.join(', ')}`, 400), origin)
    }

    const latest = await (prisma as any).phedLetterTemplate.findFirst({
      where: { companyId, type: 'SALARY_INCREASE' },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latest?.version ?? 0) + 1

    const created = await (prisma as any).phedLetterTemplate.create({
      data: {
        companyId,
        type: 'SALARY_INCREASE',
        version: nextVersion,
        body: bodyText,
        letterhead,
        signatoryName,
        signatoryTitle,
        tokens: extractTokens(bodyText),
        createdById: user.userId,
      },
    })

    await auditLetterEvent(companyId, user.userId, 'TEMPLATE_SAVE', null, `Saved template v${nextVersion}`, clientIp(req.headers))

    return withCors(ApiResponse.success({ id: created.id, version: created.version }, 'Template saved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
