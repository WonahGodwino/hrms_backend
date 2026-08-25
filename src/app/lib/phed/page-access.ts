// Module 13 — default Role-Based Payroll Access Matrix (PRD 13.2), the
// authoritative reference for which PhedAccessRole sees which pageKey.

import { prisma } from '@/app/lib/db'
import { PhedAccessRole, PhedPageKey } from '@prisma/client'

export const PHED_ALL_PAGE_KEYS: PhedPageKey[] = [
  'BANK_PAGE', 'PENSION_SCHEDULE', 'PAYE_SCHEDULE', 'NSITF_SCHEDULE', 'ITF_SCHEDULE', 'NHF_SCHEDULE',
  'UNIONS_COOPERATIVES_DEDUCTIONS', 'LIABILITIES_TO_PHED', 'COST_CENTRE_REPORT',
  'IAD_SUMMARY', 'IAD_CHANGES', 'IAD_EXITED', 'IAD_NEW_HIRED',
]

// PRD 13.2. Full-access roles get every pageKey as literal rows (13.6 #46) —
// CFO and MD/CEO default to full access per the PRD's explicit note, since
// the client's own matrix didn't list them.
export const PHED_DEFAULT_ROLE_PAGE_KEYS: Record<PhedAccessRole, PhedPageKey[]> = {
  MANAGER_COMP_BENEFITS: PHED_ALL_PAGE_KEYS,
  TAX_AUDIT: PHED_ALL_PAGE_KEYS,
  CHIEF_PEOPLE_OFFICER: PHED_ALL_PAGE_KEYS,
  CHIEF_FINANCE_OFFICER: PHED_ALL_PAGE_KEYS,
  MD_CEO: PHED_ALL_PAGE_KEYS,
  HEAD_INTERNAL_AUDIT: ['IAD_SUMMARY', 'IAD_CHANGES', 'IAD_EXITED', 'IAD_NEW_HIRED'],
  TREASURY_TEAM: [
    'BANK_PAGE', 'PENSION_SCHEDULE', 'PAYE_SCHEDULE', 'NSITF_SCHEDULE', 'ITF_SCHEDULE', 'NHF_SCHEDULE',
    'UNIONS_COOPERATIVES_DEDUCTIONS', 'LIABILITIES_TO_PHED',
  ],
  FINANCIAL_REPORTING_TEAM: ['COST_CENTRE_REPORT'],
  TAX_TEAM: ['PAYE_SCHEDULE'],
}

// Idempotent — safe to re-run; only fills in missing (company, role, pageKey)
// rows, mirroring the existing syncModuleAccess() convention.
export async function seedDefaultPhedRoleAccessGrants(companyId: string): Promise<{ created: number }> {
  const rows: { companyId: string; accessRole: PhedAccessRole; pageKey: PhedPageKey }[] = []
  for (const [role, pageKeys] of Object.entries(PHED_DEFAULT_ROLE_PAGE_KEYS) as [PhedAccessRole, PhedPageKey[]][]) {
    for (const pageKey of pageKeys) {
      rows.push({ companyId, accessRole: role, pageKey })
    }
  }
  const result = await prisma.phedRoleAccessGrant.createMany({ data: rows, skipDuplicates: true })
  return { created: result.count }
}
