// Request body schemas for the payroll, payslip and staff write routes (API-002).
// Each lists exactly the fields its route reads; anything else is dropped.
// Field types follow what the routes and the frontend already use; the routes
// keep their own "is required" checks and messages.
import { z } from 'zod'

const text = z.string().optional()
const nullableText = z.string().nullish()
const flag = z.boolean().optional()
const ids = z.array(z.string()).optional()
const numberish = z.union([z.number(), z.string()]).optional()
const record = z.record(z.string(), z.unknown()).optional()

// ── staff (admin) ───────────────────────────────────────────
export const reasonBodySchema = z.object({ reason: text })
export const setPasswordBodySchema = z.object({ newPassword: text })
export const bulkDeleteStaffBodySchema = z.object({ ids })
export const createStaffBodySchema = z.object({ companyId: text })
export const bulkReactivateBodySchema = z.object({
  staffIds: ids,
  companyId: text,
  filters: z.object({ department: text, fromDate: text, toDate: text, search: text }).optional(),
})

// Staff edit keeps unknown keys so the route can still answer "Invalid fields: ..." for them.
export const editStaffBodySchema = z.object({
  email: nullableText, staffId: nullableText, firstName: nullableText, lastName: nullableText,
  department: nullableText, position: nullableText, designationId: nullableText, phone: nullableText,
  bankName: nullableText, accountNumber: nullableText, bvn: nullableText, rsaPin: nullableText,
  pfaCode: nullableText, pensionEmployerCode: nullableText, isRegistered: z.boolean().nullish(),
  role: nullableText, isActive: z.boolean().nullish(), encodedId: nullableText, hireDate: nullableText,
  managerId: nullableText, requirePasswordChange: z.boolean().nullish(), middleName: nullableText,
  gender: nullableText, dateOfBirth: nullableText, maritalStatus: nullableText, stateOfOrigin: nullableText,
  lgaOfOrigin: nullableText, townOfOrigin: nullableText, alternatePhone: nullableText, nin: nullableText,
  stateOfIssuance: nullableText, residentialAddress: nullableText,
  numberOfPrimaryDependants: z.union([z.number(), z.string()]).nullish(),
  // not updatable here; read only to be refused
  password: z.unknown().optional(), companyId: z.unknown().optional(),
}).catchall(z.unknown())

// ── staff ───────────────────────────────────────────────────
export const assignManagerBodySchema = z.object({ staffIds: ids, managerId: text })
export const staffTransferBodySchema = z.object({
  staffRecordId: text, staffRecordIds: ids, toCompanyId: text,
  newDepartmentId: nullableText, newDesignationId: nullableText, newLocationId: nullableText,
  reason: nullableText, dryRun: flag,
})
export const compensationBodySchema = z.object({ templateId: text, values: record })
export const bulkEditTemplateBodySchema = z.object({ companyId: text, staffIds: ids })
// Same message the pay-day route always gave for a bad cycle.
const paymentCycle = z.enum(['WEEKLY', 'BI_WEEKLY', 'MONTHLY'], { error: 'Invalid payment cycle. Must be WEEKLY, BI_WEEKLY, or MONTHLY' }).optional()
export const createPayDatesBodySchema = z.object({
  companyId: text,
  payDates: z.array(z.object({ paymentDate: text, paymentCycle, description: nullableText })).optional(),
})
export const updatePayDateBodySchema = z.object({ id: text, paymentDate: text, paymentCycle, description: nullableText })

// ── payroll ─────────────────────────────────────────────────
export const generatePayrollBodySchema = z.object({
  companyId: text, templateId: text, month: text, year: numberish, workingDaysInAMonth: numberish,
  excludedStaffIds: z.unknown().optional(),
})
export const approveRunBodySchema = z.object({ sendEmails: flag })
export const runStaffIdsBodySchema = z.object({ staffIds: ids })
export const deleteRunBodySchema = z.object({ confirmPayPeriod: text })
export const valuesBodySchema = z.object({ values: record })
export const payslipPresetBodySchema = z.object({ companyId: text, name: text, description: nullableText, htmlContent: text, isActive: flag })
export const presetPreviewBodySchema = z.object({ companyId: text, htmlContent: text })
export const bulkSendBodySchema = z.object({ companyId: text, month: text, year: numberish })
// payroll.year is an Int column, so a numeric string ("2026") is turned into a number here.
export const resendEmailBodySchema = z.object({ staffEmail: text, newEmail: text, month: text, year: z.coerce.number().int().optional(), companyId: text })
export const payslipIdsBodySchema = z.object({ payslipIds: ids, companyId: text })
export const uploadIdBodySchema = z.object({ uploadId: text })
const templateSection = z.record(z.string(), z.unknown())
export const createTemplateBodySchema = z.object({
  companyId: text, templateName: text, sections: z.array(templateSection).optional(), isSystem: flag,
  payslipCompanyName: nullableText, payslipPresetId: nullableText,
})
export const updateTemplateBodySchema = z.object({
  templateId: text, templateName: text, sections: z.array(templateSection).optional(),
  payslipCompanyName: nullableText, payslipPresetId: nullableText,
})
