// src/app/lib/staff-loans-benefits/page-access.ts
//
// Department/designation-based access for the five Staff Loans & Benefits
// admin pages (Financial Dashboard, Loan Management, Loan Policy Config,
// Benefit Policy Config, Benefit Allocation). Platform role no longer gates
// these pages — access is SUPER_ADMIN, or membership in a company-configured
// department/designation allow-list. A page with no configured allow-list
// yet is SUPER_ADMIN-only ("locked down until configured" — a deliberate
// rollout choice, not a bug).
import { prisma } from '@/app/lib/db'

export type PageKey = 'FINANCIAL_DASHBOARD' | 'LOAN_MANAGEMENT' | 'LOAN_POLICY_CONFIG' | 'BENEFIT_POLICY_CONFIG' | 'BENEFIT_ALLOCATION'

export const PAGE_KEYS: PageKey[] = ['FINANCIAL_DASHBOARD', 'LOAN_MANAGEMENT', 'LOAN_POLICY_CONFIG', 'BENEFIT_POLICY_CONFIG', 'BENEFIT_ALLOCATION']

export const PAGE_KEY_LABELS: Record<PageKey, string> = {
  FINANCIAL_DASHBOARD: 'Financial Dashboard',
  LOAN_MANAGEMENT: 'Loan Management',
  LOAN_POLICY_CONFIG: 'Loan Policy Configuration',
  BENEFIT_POLICY_CONFIG: 'Benefit Policy Configuration',
  BENEFIT_ALLOCATION: 'Benefit Allocation',
}

export async function canAccessPage(pageKey: PageKey, user: { role: string; userId: string; companyId?: string | null }): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  if (!user.companyId) return false

  const config = await prisma.loansBenefitsPageAccess.findUnique({
    where: { companyId_pageKey: { companyId: user.companyId, pageKey } },
  })
  if (!config) return false

  const staff = await prisma.staffRecord.findUnique({
    where: { id: user.userId },
    select: { departmentId: true, designationId: true },
  })
  if (!staff) return false

  const deptIds = (config.departmentIds as string[]) || []
  const desigIds = (config.designationIds as string[]) || []

  return (!!staff.departmentId && deptIds.includes(staff.departmentId)) || (!!staff.designationId && desigIds.includes(staff.designationId))
}

// Resolves every governed page the given user currently has access to —
// used by the frontend's single "my-access" fetch (nav + route guard).
export async function resolveAccessiblePages(user: { role: string; userId: string; companyId?: string | null }): Promise<PageKey[]> {
  if (user.role === 'SUPER_ADMIN') return [...PAGE_KEYS]
  const results = await Promise.all(PAGE_KEYS.map((key) => canAccessPage(key, user)))
  return PAGE_KEYS.filter((_, i) => results[i])
}
