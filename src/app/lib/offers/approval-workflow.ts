// Reusable company-wide offer approval workflow.
//
// A company configures its approval flow ONCE (an ordered list of approvers +
// a routing mode). Every new offer then has that chain applied automatically —
// no re-assigning approvers per offer. HR can still override a specific offer's
// chain via the per-offer "Assign Approver" action (request-approval).
import { prisma } from '@/app/lib/db'

export interface WorkflowStep {
  order: number
  approverId: string
  approverName?: string | null
  approverRole?: string | null
}
export interface ApprovalWorkflow {
  mode: 'sequential' | 'parallel'
  steps: WorkflowStep[]
}

/** Read + normalize a company's configured approval workflow (or null). */
export async function getCompanyApprovalWorkflow(companyId: string): Promise<ApprovalWorkflow | null> {
  const company = await (prisma as any).company.findUnique({
    where: { id: companyId },
    select: { offerApprovalWorkflow: true },
  }).catch(() => null)
  return normalizeWorkflow(company?.offerApprovalWorkflow)
}

export function normalizeWorkflow(raw: any): ApprovalWorkflow | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) return null
  const mode: 'sequential' | 'parallel' = raw.mode === 'parallel' ? 'parallel' : 'sequential'
  const seen = new Set<string>()
  const steps: WorkflowStep[] = raw.steps
    .filter((s: any) => s && s.approverId && !seen.has(String(s.approverId)) && seen.add(String(s.approverId)))
    .map((s: any, i: number) => ({
      order: Number(s.order) || i + 1,
      approverId: String(s.approverId),
      approverName: s.approverName ? String(s.approverName) : null,
      approverRole: s.approverRole ? String(s.approverRole) : null,
    }))
    .sort((a: WorkflowStep, b: WorkflowStep) => a.order - b.order)
    .map((s: WorkflowStep, i: number) => ({ ...s, order: i + 1 }))
  return steps.length ? { mode, steps } : null
}

/**
 * Apply the company's default workflow to an offer — creating its approval steps.
 * Idempotent: does nothing if the offer already has approval steps, or the
 * company has no configured workflow. Best-effort (never throws to the caller).
 */
export async function applyApprovalWorkflow(offerId: string, companyId: string): Promise<boolean> {
  try {
    const existing = await prisma.recruitmentOfferApproval.count({ where: { offerId } })
    if (existing > 0) return false

    const workflow = await getCompanyApprovalWorkflow(companyId)
    if (!workflow) return false

    const isSequential = workflow.mode !== 'parallel'
    await prisma.$transaction([
      ...workflow.steps.map((s, i) =>
        prisma.recruitmentOfferApproval.create({
          data: {
            offerId,
            approverId: s.approverId,
            approverName: s.approverName || null,
            approverRole: s.approverRole || null,
            step: i + 1,
            status: isSequential && i > 0 ? 'AWAITING_PREVIOUS' : 'PENDING',
          },
        }),
      ),
      prisma.offer.update({
        where: { id: offerId },
        data: { routingMode: (isSequential ? 'SEQUENTIAL' : 'PARALLEL') as any, status: 'PENDING_APPROVAL' },
      }),
    ])
    return true
  } catch (err) {
    console.error(`[APPROVAL_WORKFLOW] Failed to apply workflow to offer ${offerId}:`, err)
    return false
  }
}
