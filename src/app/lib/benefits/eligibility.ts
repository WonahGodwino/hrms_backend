// Designation + grade-level scoping for benefit policies.
//
// Rules (see BenefitPolicy.designationId / gradeLevelId):
//   - designationId blank            → applies to everyone (company-wide)
//   - designationId set, grade blank → applies to ALL staff in that designation
//   - designationId set, grade set   → applies ONLY to staff in that designation
//                                       AND that grade level; others in the
//                                       designation neither see nor receive it
//   - grade set, designation blank   → applies to staff in that grade level
export interface BenefitScope {
  designationId?: string | null
  gradeLevelId?: string | null
}

export interface StaffScope {
  designationId?: string | null
  currentGradeId?: string | null
}

// True when a staff member falls within a benefit policy's designation/grade scope.
export function matchesBenefitScope(policy: BenefitScope, staff: StaffScope): boolean {
  const matchesDesignation = !policy.designationId || policy.designationId === staff.designationId
  const matchesGrade = !policy.gradeLevelId || policy.gradeLevelId === staff.currentGradeId
  return matchesDesignation && matchesGrade
}

// A human-readable reason when a staff member is OUT of scope (for STAFF views).
export function scopeIneligibilityReason(policy: BenefitScope, staff: StaffScope): string | null {
  if (policy.designationId && policy.designationId !== staff.designationId) {
    return 'Not available for your designation'
  }
  if (policy.gradeLevelId && policy.gradeLevelId !== staff.currentGradeId) {
    return 'Not available for your grade level'
  }
  return null
}
