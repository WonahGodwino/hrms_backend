// src/app/lib/staff-loans-benefits/types.ts
// Shared JSON contracts for the Staff Loans & Benefits module. These shapes
// are stored as Prisma `Json` columns (approvalWorkflow, eligibilityRules,
// etc.) — not enforced by the database, only by the application code that
// reads/writes them.

// One ordered step in a configurable approval chain — used by both loan and
// benefit policies (requestApprovalWorkflow / claimApprovalWorkflow).
export type ApprovalStepConfig = {
  order: number // 1-based
  approverKind: 'ROLE' | 'LINE_MANAGER' | 'DESIGNATION' | 'DEPARTMENT_HEAD'
  role?: string // when approverKind='ROLE': 'HR' | 'ADMIN' | 'SUPER_ADMIN'
  designationId?: string // when approverKind='DESIGNATION'
  designationTitle?: string // denormalized snapshot, since policies snapshot into requests
  // DEPARTMENT_HEAD needs no extra field — like LINE_MANAGER it's implicit:
  // routes to whoever heads the requester's own department (Department.headId).
}

// One rule in a policy's eligibility rule-builder.
export type EligibilityRule = {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn'
  value: any
  logic?: 'AND' | 'OR' // how this rule combines with the previous one
}

export const APPROVER_ROLE_OPTIONS = ['HR', 'ADMIN', 'SUPER_ADMIN'] as const

export function validateApprovalWorkflow(workflow: unknown): ApprovalStepConfig[] {
  if (!Array.isArray(workflow) || workflow.length === 0) {
    throw new Error('An approval workflow must have at least one step')
  }

  const steps = workflow as ApprovalStepConfig[]
  const orders = new Set<number>()

  for (const step of steps) {
    if (typeof step.order !== 'number' || step.order < 1) {
      throw new Error('Each approval step needs a valid order (>= 1)')
    }
    if (orders.has(step.order)) {
      throw new Error(`Duplicate approval step order: ${step.order}`)
    }
    orders.add(step.order)

    if (!['ROLE', 'LINE_MANAGER', 'DESIGNATION', 'DEPARTMENT_HEAD'].includes(step.approverKind)) {
      throw new Error(`Invalid approverKind: ${step.approverKind}`)
    }
    if (step.approverKind === 'ROLE' && !step.role) {
      throw new Error('A ROLE step must specify a role')
    }
    if (step.approverKind === 'DESIGNATION' && !step.designationId) {
      throw new Error('A DESIGNATION step must specify a designationId')
    }
  }

  return [...steps].sort((a, b) => a.order - b.order)
}
