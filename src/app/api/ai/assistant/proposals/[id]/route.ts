// [ai-assistant] Proposal detail — GET.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { getProposal, serializeProposals } from '@/app/lib/ai/proposals'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma)
    if (isGuardError(guard)) return guard

    const proposal = await getProposal(prisma, params.id, guard.companyId)
    if (!proposal) return withCors(ApiResponse.notFound('Proposal not found'), origin)

    const [serialized] = await serializeProposals(prisma, guard.companyId, [proposal])
    return withCors(ApiResponse.success({ proposal: serialized }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
