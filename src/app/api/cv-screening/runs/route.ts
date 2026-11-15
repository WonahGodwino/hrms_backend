// src/app/api/cv-screening/runs/route.ts
// POST starts a screening (bulk or quick, same endpoint, differentiated by `mode`
// and file count) and responds as soon as the run + per-file rows exist;
// the actual extraction/scoring happens fire-and-forget afterwards, same
// convention as payroll generation (lib/payroll/generation/generate-payroll.ts).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveCvScreeningCompanyId } from '@/app/lib/cv-screening/companyScope'
import { startScreeningRun, processScreeningRunInBackground, RunValidationError, type IncomingCvFile } from '@/app/lib/cv-screening/runs'
import { aiConfig, resolveDefaultAiFromDb, getDefaultAiService } from '@/app/lib/aiConfig'
import rateLimit from '@/app/lib/rateLimiter'

// Lower than recruitment's 10/min, since each request here can carry up to
// MAX_FILES_PER_RUN files, so the per-request cost/time footprint is larger.
const limiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 100 })

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    try {
      await limiter.check(5, user.userId || 'anonymous')
    } catch {
      return withCors(ApiResponse.error('Rate limit exceeded. Please try again in a minute.', 429), origin)
    }

    const formData = await request.formData()

    const profileId = String(formData.get('profileId') || '')
    const mode = String(formData.get('mode') || 'BULK').toUpperCase() === 'QUICK' ? 'QUICK' : 'BULK'
    const companyIdInput = (formData.get('companyId') as string) || undefined

    await resolveDefaultAiFromDb()
    const effectiveService = getDefaultAiService()

    const useAI = formData.get('useAI') === null ? aiConfig.services.openai.enabled : formData.get('useAI') === 'true'
    const aiService = (formData.get('aiService') as string) || effectiveService
    const aiModel = (formData.get('aiModel') as string) || undefined
    const strictness = (formData.get('strictness') as string) || 'medium'

    if (!profileId) {
      return withCors(ApiResponse.error('profileId is required', 400), origin)
    }

    const scope = await resolveCvScreeningCompanyId(user, companyIdInput)
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    if (useAI) {
      const selectedService = aiConfig.services[aiService as keyof typeof aiConfig.services]
      if (!selectedService?.enabled) {
        return withCors(
          ApiResponse.error(
            `AI service "${aiService}" is not configured. Available services: ${Object.keys(aiConfig.services)
              .filter((s) => aiConfig.services[s as keyof typeof aiConfig.services].enabled)
              .join(', ')}`,
            400
          ),
          origin
        )
      }
    }

    const fileEntries = formData.getAll('files').filter((f): f is File => f instanceof File)
    if (fileEntries.length === 0) {
      return withCors(ApiResponse.error('At least one CV file is required', 400), origin)
    }

    const files: IncomingCvFile[] = await Promise.all(
      fileEntries.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
        sizeBytes: file.size,
      }))
    )

    const { runId, totalCandidates } = await startScreeningRun({
      companyId: scope.companyId as string,
      profileId,
      mode,
      files,
      useAI,
      aiService,
      aiModel,
      strictness,
      triggeredBy: user.userId || 'system',
    })

    // Fire-and-forget: the route has already captured everything needed to
    // respond; the slow extraction/AI-scoring pass runs after we return.
    processScreeningRunInBackground(runId).catch((err) =>
      console.error('[CV_SCREENING] Background run processing failed:', err)
    )

    return withCors(
      ApiResponse.success({ runId, totalCandidates, mode }, 'Screening started', 202),
      origin
    )
  } catch (error) {
    if (error instanceof RunValidationError) {
      return withCors(ApiResponse.error(error.message, 400), origin)
    }
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const scope = await resolveCvScreeningCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const profileId = searchParams.get('profileId') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))

    const where = { companyId: scope.companyId as string, ...(profileId ? { profileId } : {}) }

    const [runs, total] = await Promise.all([
      prisma.screeningRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { profile: { select: { name: true } } },
      }),
      prisma.screeningRun.count({ where }),
    ])

    return withCors(
      ApiResponse.success({ runs, pagination: { page, pageSize, total } }, 'Screenings retrieved'),
      origin
    )
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
