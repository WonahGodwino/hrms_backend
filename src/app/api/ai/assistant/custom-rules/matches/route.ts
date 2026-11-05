// [ai-assistant] What enabled `flag` and `assign_manager` rules currently raise, for the Action Center to show (GET).
// For assign_manager the response carries the changes to apply on approval, built and checked here from real records.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { matchesForActionCenter } from '@/app/lib/core-setup/custom-rules'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard
    return withCors(ApiResponse.success({ matches: await matchesForActionCenter(prisma, guard.companyId) }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
