import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { executeInsightAction } from '@/app/lib/training/insight-actions'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/analytics/training/ai-insights/:insightId/actions
export async function POST(req: NextRequest, { params }: { params: { insightId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    if (!body.actionType) {
      return withCors(ApiResponse.error('actionType is required', 400), origin)
    }

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const result = await executeInsightAction(user, resolved.companyId, params.insightId, body)
    return withCors(ApiResponse.success(result, result.message), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
