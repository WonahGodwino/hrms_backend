// [ai-assistant] Proposal list — GET only. Proposals are created by the assistant's propose_* tools (lib/ai/tools/proposals.ts),
// never by a client request, so a person cannot save a plan whose text differs from what it does.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { approvalContext } from '@/app/lib/ai/approvers'
import { PROPOSAL_STATUSES, listProposals, serializeProposals, type ProposalStatus } from '@/app/lib/ai/proposals'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma)
    if (isGuardError(guard)) return guard

    // One status, a comma list (pending,stale), or all.
    const statusParam = searchParams.get('status') ?? 'pending'
    const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (statusParam !== 'all' && (!statuses.length || statuses.some((s) => !PROPOSAL_STATUSES.includes(s as ProposalStatus)))) {
      return withCors(ApiResponse.error('status must be pending, approved, rejected, expired, stale, a comma list of those, or all', 400), origin)
    }

    const { proposals, total } = await listProposals(prisma, guard.companyId, {
      status: statusParam === 'all' ? 'all' : (statuses as ProposalStatus[]),
      createdById: searchParams.get('mine') === 'true' ? guard.user.userId : undefined,
      limit: Number(searchParams.get('limit')) || 50,
      skip: Number(searchParams.get('skip')) || 0,
    })

    // approval: whether the viewer is the only person who could approve (the sole-approver exception to "no self-approval").
    const approval = await approvalContext(prisma, guard.companyId, guard.user.userId)
    return withCors(ApiResponse.success({ proposals: await serializeProposals(prisma, guard.companyId, proposals), total, approval }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
