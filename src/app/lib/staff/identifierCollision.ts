// src/app/lib/staff/identifierCollision.ts
//
// Shared staffId/email collision check for upload, onboarding, edit, and
// transfer flows. An offboarded/deactivated StaffRecord (isActive: false)
// keeps its exact staffId/email row, and the schema's unique constraints
// (@@unique([staffId, companyId]) / @@unique([email, companyId])) aren't
// scoped by isActive — so a plain "is this active?" pre-check isn't enough:
// even when it passes, the actual create/update would still fail with a raw
// P2002 if an inactive record already holds that value. This helper finds
// ANY holder (active or not) up front and produces a message that tells the
// caller exactly what's going on instead of surfacing a confusing generic
// "already exists" error or an unhandled database error.
import { prisma } from '@/app/lib/db'

export type IdentifierField = 'staffId' | 'email'

const FIELD_LABEL: Record<IdentifierField, string> = { staffId: 'Staff ID', email: 'Email' }

export async function findIdentifierHolder(companyId: string, field: IdentifierField, value: string, excludeStaffRecordId?: string) {
  return prisma.staffRecord.findFirst({
    where: {
      companyId,
      [field]: value,
      ...(excludeStaffRecordId ? { id: { not: excludeStaffRecordId } } : {})
    },
    select: { id: true, firstName: true, lastName: true, isActive: true }
  })
}

export function describeIdentifierCollision(field: IdentifierField, value: string, holder: { firstName: string; lastName: string; isActive: boolean }): string {
  const label = FIELD_LABEL[field]
  if (holder.isActive) {
    return `${label} "${value}" is already in use by an active staff member in this company.`
  }
  return `${label} "${value}" belongs to a previously offboarded staff member (${holder.firstName} ${holder.lastName}). Reactivate their record instead, or use a different ${label.toLowerCase()}.`
}
