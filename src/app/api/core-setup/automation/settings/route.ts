// src/app/api/core-setup/automation/settings/route.ts
//
// GET /api/core-setup/automation/settings?companyId=...
//
// Everything the Automation Center and the Action Center need in one call: the company's rule overrides, the decisions taken on
// Action Center items, the checks that ran, and the Core Setup change feed (audit).
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { AUTOMATION_DECIDER_ROLES, companyForRequest, loadAutomationState } from '@/app/lib/core-setup/automation'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const user = requireRole(authHeader.replace('Bearer ', ''), AUTOMATION_DECIDER_ROLES)

    const scope = await companyForRequest(request, user)
    if ('error' in scope) {
      return withCors(ApiResponse.error(scope.error, scope.status), origin)
    }

    const state = await loadAutomationState(scope.companyId)
    return withCors(ApiResponse.success(state), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
