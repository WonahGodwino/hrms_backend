// src/app/lib/staff-loans-benefits/benefit-eligibility.ts
// Designation scoping for benefit policies.
//
// Rules (see BenefitPolicy.designationId):
//   - designationId blank -> applies to everyone (company-wide)
//   - designationId set   -> applies to ALL staff in that designation
export interface BenefitScope {
  designationId?: string | null
}

export interface StaffScope {
  designationId?: string | null
}

export function matchesBenefitScope(policy: BenefitScope, staff: StaffScope): boolean {
  return !policy.designationId || policy.designationId === staff.designationId
}

export function scopeIneligibilityReason(policy: BenefitScope, staff: StaffScope): string | null {
  if (policy.designationId && policy.designationId !== staff.designationId) {
    return 'Not available for your designation'
  }
  return null
}
