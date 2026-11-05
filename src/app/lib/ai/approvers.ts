// [ai-assistant] Who can approve an AI proposal, and the sole-approver exception.
//
// Normally the person who asked for a change cannot approve it. The exception: when nobody else in the company could approve that
// proposal (no other active person with an approving role), the requester may approve their own, and the audit trail records it as
// a self-approval. Without this a one-person company could never use the feature.
import type { PrismaClient } from '@prisma/client'

// General proposals are approved by Super Admin, Admin or HR. Editing an automation rule is Admin-only (AUTOMATION_ADMIN_ROLES), so
// rule proposals need Admin or Super Admin; tests/ai/rules.test.ts keeps this equal to the rule route's own list.
export const GENERAL_APPROVER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR']
export const RULE_APPROVER_ROLES = ['SUPER_ADMIN', 'ADMIN']

export const approverRolesFor = (proposalType: string) => (proposalType === 'rule_setting' ? RULE_APPROVER_ROLES : GENERAL_APPROVER_ROLES)

type Db = Pick<PrismaClient, 'staffRecord'>

// Active people, other than `exceptUserId`, who could approve: staff with an approving role in the company, or such a user assigned to it.
export async function otherApproverCount(db: Db, companyId: string, roles: string[], exceptUserId: string): Promise<number> {
  return db.staffRecord.count({
    where: {
      isActive: true,
      role: { in: roles },
      id: { not: exceptUserId },
      OR: [{ companyId }, { userCompanies: { some: { companyId } } }],
    },
  })
}

// For the Action Center: is the viewer the only person who could approve what they asked for?
export async function approvalContext(db: Db, companyId: string, viewerId: string) {
  const [others, ruleOthers] = await Promise.all([
    otherApproverCount(db, companyId, GENERAL_APPROVER_ROLES, viewerId),
    otherApproverCount(db, companyId, RULE_APPROVER_ROLES, viewerId),
  ])
  return { soleApprover: others === 0, soleRuleApprover: ruleOthers === 0 }
}
