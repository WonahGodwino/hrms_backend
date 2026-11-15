// src/app/api/cv-screening/runs/[id]/status/route.ts
// GET - polling target for an async screening. Mirrors
// staff/bulk-edit/upload/status/[id]/route.ts's shape.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveCvScreeningCompanyId } from '@/app/lib/cv-screening/companyScope'
import { STALE_RUN_THRESHOLD_MS } from '@/app/lib/cv-screening/runs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const scope = await resolveCvScreeningCompanyId(user, request.nextUrl.searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    let run = await prisma.screeningRun.findFirst({ where: { id, companyId: scope.companyId as string } })
    if (!run) return withCors(ApiResponse.error('Screening not found', 404), origin)

    // A run stuck PROCESSING past the stale threshold (server restarted
    // mid-run, etc.) is marked FAILED so polling never hangs forever.
    if (run.status === 'PROCESSING' && Date.now() - run.startedAt.getTime() > STALE_RUN_THRESHOLD_MS) {
      run = await prisma.screeningRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', errorMessage: 'Screening timed out', completedAt: new Date() },
      })
    }

    return withCors(
      ApiResponse.success(
        {
          runId: run.id,
          status: run.status,
          mode: run.mode,
          totalCandidates: run.totalCandidates,
          processedCount: run.processedCount,
          succeededCount: run.succeededCount,
          failedCount: run.failedCount,
          errorMessage: run.errorMessage,
          completedAt: run.completedAt,
        },
        'Screening status retrieved'
      ),
      origin
    )
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
