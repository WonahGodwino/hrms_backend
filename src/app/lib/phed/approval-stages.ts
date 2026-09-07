import { PhedAccessRole, PhedApprovalMemoStatus, PhedApprovalStampAction } from '@prisma/client'

// Module 12 — fixed six-stage chain. Stage order/role mapping must never be
// configurable per company (PRD 12.3) — it lives in code, not the database.
// Stage 1 is performed by the HR/ADMIN/SUPER_ADMIN who uploaded the payroll
// (acting as Manager, Compensation & Benefits) — not by an assigned role holder.
export interface PhedApprovalStageDef {
  stage: number
  role: PhedAccessRole
  label: string
  action: PhedApprovalStampAction // stamp action recorded when forwarding FROM this stage
  resultStatus: PhedApprovalMemoStatus // memo status after forwarding FROM this stage
  nextStage: number // the stage the memo lands at after forwarding FROM this stage
  stampLabel: string // display label for the stamp ledger / PDF
}

// Fixed six-stage chain. After the Tax Manager (Stage 2) concurs, the memo
// returns to the HR uploader (Stage 1) for sign-off; HR then releases it to
// Head, Internal Audit (Stage 3).
export const PHED_APPROVAL_STAGES: PhedApprovalStageDef[] = [
  {
    stage: 1,
    role: 'MANAGER_COMP_BENEFITS',
    label: 'Manager, Compensation & Benefits',
    action: 'SUBMITTED',
    resultStatus: 'PENDING_TAX_AUDIT',
    nextStage: 2,
    stampLabel: 'Prepared By',
  },
  {
    stage: 2,
    role: 'TAX_AUDIT',
    label: 'Tax Manager',
    action: 'TAX_AUDITED',
    resultStatus: 'PENDING_HR_APPROVAL',
    nextStage: 1,
    stampLabel: 'Tax Manager Approval By',
  },
  {
    stage: 3,
    role: 'HEAD_INTERNAL_AUDIT',
    label: 'Head, Internal Audit',
    action: 'RECOMMENDED',
    resultStatus: 'PENDING_FIRST_LEVEL_APPROVAL',
    nextStage: 4,
    stampLabel: 'Reviewed & Concurred By',
  },
  {
    stage: 4,
    role: 'CHIEF_PEOPLE_OFFICER',
    label: 'Chief People Officer',
    action: 'APPROVED',
    resultStatus: 'PENDING_SECOND_LEVEL_APPROVAL',
    nextStage: 5,
    stampLabel: 'First-Level Executive Approval By',
  },
  {
    stage: 5,
    role: 'CHIEF_FINANCE_OFFICER',
    label: 'Chief Finance Officer',
    action: 'APPROVED',
    resultStatus: 'PENDING_FINAL_APPROVAL',
    nextStage: 6,
    stampLabel: 'Second-Level Approval & Financial Endorsement By',
  },
  {
    stage: 6,
    role: 'MD_CEO',
    label: 'MD/CEO',
    action: 'FINAL_APPROVED',
    resultStatus: 'APPROVED',
    nextStage: 6,
    stampLabel: 'Final Approval & Release Authorisation By',
  },
]

export const FINAL_STAGE = PHED_APPROVAL_STAGES[PHED_APPROVAL_STAGES.length - 1].stage

export function getStageDef(stage: number): PhedApprovalStageDef | undefined {
  return PHED_APPROVAL_STAGES.find(s => s.stage === stage)
}

export function getStageForRole(role: PhedAccessRole): PhedApprovalStageDef | undefined {
  return PHED_APPROVAL_STAGES.find(s => s.role === role)
}

// Memo Archive / detail display status (PRD Screen 4): a thin label layered
// over the underlying status enum, not a separate stored field.
export function getDisplayStatus(status: PhedApprovalMemoStatus): string {
  if (status === 'APPROVED') return 'Approved'
  if (status === 'RETURNED_FOR_CORRECTION') return 'Flagged & Restarted'
  if (status === 'PENDING_HR_APPROVAL') return 'Awaiting HR Sign-off'
  return 'Currently In Progress'
}
