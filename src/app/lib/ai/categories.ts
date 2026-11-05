// [ai-assistant] Maps every StaffRecord scalar to a data category.
// The gate (gate.ts) uses these categories to decide which fields the AI may see.
// If a new field is added to StaffRecord without mapping it here, the DMMF coverage test fails.

export type DataCategory =
  | 'personal'
  | 'identity'
  | 'address'
  | 'bank'
  | 'employment'
  | 'compensation'
  | 'health'
  | 'next_of_kin'
  | 'disciplinary'
  | 'leave'
  | 'system'

export const ALWAYS_HIDDEN: readonly DataCategory[] = ['identity', 'bank'] as const

export const ALL_CATEGORIES: readonly DataCategory[] = [
  'personal',
  'identity',
  'address',
  'bank',
  'employment',
  'compensation',
  'health',
  'next_of_kin',
  'disciplinary',
  'leave',
] as const

const FIELD_CATEGORY_MAP: Record<string, DataCategory> = {
  // personal
  firstName: 'personal',
  lastName: 'personal',
  middleName: 'personal',
  email: 'personal',
  phone: 'personal',
  alternatePhone: 'personal',
  dateOfBirth: 'personal',
  gender: 'personal',
  maritalStatus: 'personal',
  stateOfOrigin: 'personal',
  lgaOfOrigin: 'personal',
  townOfOrigin: 'personal',
  avatarUrl: 'personal',

  // identity — ALWAYS hidden
  bvn: 'identity',
  nin: 'identity',
  stateOfIssuance: 'identity',

  // address
  residentialAddress: 'address',
  location: 'address',
  locationId: 'address',

  // bank — ALWAYS hidden
  bankName: 'bank',
  accountNumber: 'bank',

  // employment
  staffId: 'employment',
  position: 'employment',
  department: 'employment',
  departmentId: 'employment',
  hireDate: 'employment',
  role: 'employment',
  isActive: 'employment',
  managerId: 'employment',

  // compensation (pension fields included here — they describe pay structure)
  rsaPin: 'compensation',
  pfaCode: 'compensation',
  pensionContributionType: 'compensation',
  pensionEmployerCode: 'compensation',
  voluntaryPensionEmployee: 'compensation',
  voluntaryPensionEmployer: 'compensation',
  otherPensionContribution: 'compensation',

  // health
  numberOfPrimaryDependants: 'personal',

  // system — never exposed to the AI
  id: 'system',
  password: 'system',
  isRegistered: 'system',
  requirePasswordChange: 'system',
  companyId: 'system',
  createdBy: 'system',
  createdAt: 'system',
  updatedAt: 'system',
  updatedBy: 'system',
  encodedId: 'system',
  isBlocked: 'system',
  blockedAt: 'system',
  blockedById: 'system',
  blockedByName: 'system',
  blockedByRole: 'system',
  blockReason: 'system',
}

export function categoryOf(field: string): DataCategory {
  return FIELD_CATEGORY_MAP[field] ?? 'system'
}

export function fieldsByCategory(category: DataCategory): string[] {
  return Object.entries(FIELD_CATEGORY_MAP)
    .filter(([, cat]) => cat === category)
    .map(([field]) => field)
}

export function isFieldVisible(field: string, visibleCategories: string[]): boolean {
  const cat = categoryOf(field)
  if (cat === 'system') return false
  if ((ALWAYS_HIDDEN as readonly string[]).includes(cat)) return false
  return visibleCategories.includes(cat)
}
