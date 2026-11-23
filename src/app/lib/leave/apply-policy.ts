// Moved out of app/api/leaves/apply/route.ts (CODE-004: keep route files small).
import { z } from 'zod'
import type { LeavePolicy } from '@prisma/client'
import { formatEmploymentDate } from '@/app/lib/leave/apply-helpers'

export const cuidOrUuidSchema = z.union([z.string().cuid(), z.string().uuid()])

export const optionalIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  cuidOrUuidSchema.optional()
)

export const optionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional()
)

export const leaveApplicationSchema = z.object({
  leaveTypeId: cuidOrUuidSchema,
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format. Use YYYY-MM-DD',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end date format. Use YYYY-MM-DD',
  }),
  reason: z.string().min(5).max(500),
  emergencyContact: z.string().optional(),
  contactPhone: z.string().optional(),
  handoverTo: optionalNonEmptyStringSchema,
  handoverNotes: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  isHalfDay: z.boolean().optional().default(false),
  halfDayPart: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional(),
  medicalCertificateNumber: z.string().optional(),
  medicalCertificateDate: z.string().optional(),
  medicalCertificateIssuer: z.string().optional(),
  // Optional: for HR/Admin to apply on behalf of others
  staffRecordId: optionalIdSchema
})

export function resolveEmploymentDate(staff: { hireDate?: Date | string | null; createdAt: Date | string }): Date {
  return staff.hireDate ? new Date(staff.hireDate) : new Date(staff.createdAt)
}

export type PolicyRules = Pick<LeavePolicy, 'name' | 'maxDays' | 'carryOver' | 'isPaid' | 'accrualRate' | 'minEmploymentMonths'
  | 'requiresApproval' | 'approvalWorkflow' | 'noticePeriod' | 'documentationRequired' | 'documentationTiming'>

export type MedicalCertificate = { medicalCertificateNumber?: string | null; medicalCertificateDate?: string | null; medicalCertificateIssuer?: string | null }

export async function validateAgainstCompanyPolicy(
  policy: PolicyRules,
  leaveType: { name: string },
  staff: Parameters<typeof resolveEmploymentDate>[0],
  startDate: Date,
  _endDate: Date,
  requestedDays: number,
  _isHalfDay: boolean,
  medicalData: MedicalCertificate
): Promise<{ 
  isValid: boolean; 
  errors: string[];
  warnings: string[];
  policyDetails: Record<string, unknown>;
}> {
  const errors: string[] = []
  const warnings: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const policyDetails = {
    name: policy.name,
    maxDays: policy.maxDays,
    noticePeriod: policy.noticePeriod,
    minEmploymentMonths: policy.minEmploymentMonths,
    requiresApproval: policy.requiresApproval,
    approvalWorkflow: policy.approvalWorkflow,
    isPaid: policy.isPaid,
    documentationRequired: policy.documentationRequired,
    carryOver: policy.carryOver,
    accrualRate: policy.accrualRate
  }

  if (policy.maxDays && requestedDays > policy.maxDays) {
    errors.push(
      `Maximum ${policy.maxDays} days allowed for ${leaveType.name}. ` +
      `You requested ${requestedDays} days.`
    )
  }

  if (policy.noticePeriod > 0) {
    const noticeDays = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (noticeDays < policy.noticePeriod) {
      errors.push(
        `${policy.noticePeriod} days advance notice required for ${leaveType.name}. ` +
        `You gave ${noticeDays} days notice.`
      )
    }
  }

  if (policy.minEmploymentMonths > 0) {
    const employmentDate = resolveEmploymentDate(staff)
    const monthsEmployed = (today.getFullYear() - employmentDate.getFullYear()) * 12 +
                         (today.getMonth() - employmentDate.getMonth())

    if (monthsEmployed < policy.minEmploymentMonths) {
      errors.push(
        `${policy.minEmploymentMonths} months of employment required for ${leaveType.name}. ` +
        `You have ${monthsEmployed} months (employment date: ${formatEmploymentDate(employmentDate)}).`
      )
    }
  }

  if (policy.documentationRequired) {
    const hasDocumentation = medicalData.medicalCertificateNumber &&
                           medicalData.medicalCertificateDate &&
                           medicalData.medicalCertificateIssuer

    if (!hasDocumentation) {
      // AFTER_LEAVE policies (e.g. sick leave): the document often doesn't
      // exist yet at application time (you get the medical report after seeing
      // a doctor), so don't block — apply now, submit the document later. Only
      // AT_APPLICATION policies hard-require it upfront.
      if (policy.documentationTiming === 'AFTER_LEAVE') {
        warnings.push(
          `${leaveType.name} requires supporting documentation. ` +
          `You can apply now and submit it after your leave (e.g. a medical report).`
        )
      } else {
        errors.push(
          `${leaveType.name} requires supporting documentation. ` +
          `Please provide medical certificate number, date, and issuer.`
        )
      }
    }
  }

  if (policy.accrualRate && policy.accrualRate > 0) {
    const employmentDate = resolveEmploymentDate(staff)
    const totalMonths = (today.getFullYear() - employmentDate.getFullYear()) * 12 +
                       (today.getMonth() - employmentDate.getMonth())
    const accruedDays = totalMonths * policy.accrualRate
    
    if (requestedDays > accruedDays) {
      warnings.push(
        `Based on accrual rate of ${policy.accrualRate} days/month since ${formatEmploymentDate(employmentDate)}, ` +
        `you have approximately ${accruedDays.toFixed(1)} accrued days.`
      )
    }
  }

  if (!policy.isPaid) {
    warnings.push(`${leaveType.name} is unpaid leave according to company policy.`)
  }

  return { isValid: errors.length === 0, errors, warnings, policyDetails }
}

export function getNextSteps(status: string, currentStep: string): string[] {
  const steps = []
  
  if (status === 'APPROVED') {
    steps.push('✓ Leave automatically approved per company policy')
    steps.push('• Balance updated: Pending → Used')
    steps.push('• You may proceed with your leave plans')
    return steps
  }
  
  if (currentStep === 'MANAGER') {
    steps.push('⏳ Waiting for your department line manager(s)')
    steps.push('• Each line manager approves in order, then the request moves to HR')
  }
  
  if (currentStep === 'HR') {
    steps.push('⏳ Waiting for HR approval')
    steps.push('• HR will review your request')
  }
  
  steps.push('• You will be notified at each approval stage')
  steps.push('• Pending days reserved in your balance')
  
  return steps
}
