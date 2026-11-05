// [ai-assistant] Decide a proposal — POST { decision: 'approve' | 'reject' | 'complete', reason?, result? }.
// approve  → stale check, self-approval guard, atomic claim; returns the plan for the approver's browser to run (executePlan).
//            Optional modifications { remove: [stepId], value } = Modify; records that changed since the proposal are skipped and listed.
// reject   → closes it without changing anything (the requester may also withdraw their own proposal).
// complete → the approver's browser reports how many changes landed.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { assertTrialWritable, trialErrorBody } from '@/app/lib/trial/guard'
import { actorFor, recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import { decideProposal, type Decision } from '@/app/lib/ai/proposalDecision'

const DECISIONS: Decision[] = ['approve', 'reject', 'complete']

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma)
    if (isGuardError(guard)) return guard

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const decision = String(body.decision ?? '') as Decision
    if (!DECISIONS.includes(decision)) {
      return withCors(ApiResponse.error('decision must be approve, reject or complete', 400), origin)
    }

    // Approving or reporting a completed proposal changes company data, so a read-only or expired trial cannot do it.
    // Rejecting a proposal changes nothing and stays allowed.
    if (decision === 'approve' || decision === 'complete') {
      try {
        await assertTrialWritable(guard.companyId)
      } catch (err) {
        const body = trialErrorBody(err)
        if (body) return withCors(ApiResponse.error(body.message, body.status, [], { code: body.code }), origin)
        throw err
      }
    }

    const actor = await actorFor(guard.user)
    const outcome = await decideProposal(
      prisma,
      {
        proposalId: params.id,
        companyId: guard.companyId,
        actor: { userId: guard.user.userId, role: guard.user.role, name: actor.name },
        decision,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        result: body.result && typeof body.result === 'object' ? (body.result as { applied: unknown; failed: unknown }) : undefined,
        modifications: body.modifications && typeof body.modifications === 'object' && !Array.isArray(body.modifications) ? (body.modifications as { remove?: unknown; value?: unknown }) : undefined,
      },
      { audit: recordCoreSetupEvent },
    )

    if (!outcome.ok) {
      return withCors(ApiResponse.error(outcome.message, outcome.httpStatus, [], { code: outcome.code, ...(outcome.changes ? { changes: outcome.changes } : {}) }), origin)
    }
    return withCors(ApiResponse.success({ status: outcome.status, ...(outcome.plan ? { plan: outcome.plan } : {}), ...(outcome.skipped ? { skipped: outcome.skipped } : {}) }, 'Done'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
