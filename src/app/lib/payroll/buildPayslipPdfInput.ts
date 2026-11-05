// src/app/lib/payroll/buildPayslipPdfInput.ts
//
// Regenerates a payslip PDF straight from an already-stored Payroll row —
// used by the payslip edit-in-place feature (PATCH /api/payslips/[id]) to
// keep the downloadable PDF and Payslip.grossPay/netPay in sync after HR
// corrects a figure directly, without re-uploading anything.
//
// Each function below mirrors — deliberately does not refactor or share
// code with — the exact Payroll-column-to-PDF-input mapping the matching
// upload processor (isurf-standard.ts / blueridge.ts / dynamic-processor.ts)
// already builds at upload time, quirks included (e.g. ISURF_STANDARD's PDF
// "transportationAllowance" has always come from Payroll.dressing, not a
// same-named column; BLUERIDGE's PDF "basicSalary" has always preferred
// proratedGrossPay over basicSalary). Changing either processor's own
// mapping later means updating the matching function here too, or a
// regenerated PDF will silently stop matching what upload would have
// produced.
//
// Known, deliberate gap: daysInMonth/daysWorked shown on ISURF_STANDARD and
// BLUERIDGE payslips are parsed transiently from the upload row and never
// persisted anywhere on Payroll — there is no stored source to recover them
// from for an existing row, so regeneration defaults both to 0, the same
// fallback already used by finalize-generated-payroll.ts elsewhere. DYNAMIC
// payslips' "additionalStaffDetails" block (extra custom STAFF_DETAILS
// fields shown alongside the Employee Information box) depends on a
// heuristic field-role detection that only runs against a fresh template
// field list at upload time; regeneration intentionally omits it rather
// than risk a subtly wrong reconstruction — the earnings/deductions/summary
// figures that actually matter for a correction are unaffected.
import { generatePayslipPdf } from './generatePayslipPdf'
import { generateEnhancedPayslipPdf, type GeneratePayslipInput as EnhancedGeneratePayslipInput } from './generateEnhancedPayslipPdf'
import { generatePayslipPdfUnified, getActivePresetHtml, type PresetAwarePayslipInput } from './payslip-preset-renderer'
import type { GeneratePayslipInput as LegacyGeneratePayslipInput, ParsedPayrollRow } from './types'

type StaffRecordLike = {
  staffId: string
  firstName: string
  lastName: string
  email: string
  department: string | null
  position: string | null
}

type CompanyLike = {
  companyName: string
  address: string | null
  phone: string | null
  logo: string | null
  taxId: string | null
  baseCurrency?: string | null
}

// Matches the exact Decimal columns on the Payroll model this file reads.
// Typed `unknown` rather than `number` because Prisma returns these as
// Decimal instances, not plain numbers — n() below normalizes either.
type DecimalLike = unknown
type PayrollLike = {
  templateType: string | null
  basicSalary: DecimalLike
  housing: DecimalLike
  transport: DecimalLike
  dressing: DecimalLike
  leaveAllowance: DecimalLike
  entertainment: DecimalLike
  utility: DecimalLike
  otherAllowance: DecimalLike
  transportationAllowance: DecimalLike
  grossPay: DecimalLike
  payee: DecimalLike
  pensionDeduction: DecimalLike
  netSalary: DecimalLike
  bonusKPI: DecimalLike
  deductions: DecimalLike
  overtimeIncome: DecimalLike
  communicationAllowance: DecimalLike
  outstandingIncome: DecimalLike
  walletPayment: DecimalLike
  commercialPayment: DecimalLike
  proratedGrossPay: DecimalLike
  customFields: unknown
}

function n(value: unknown): number {
  if (value === null || value === undefined) return 0
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : 0
}

function staffInfo(staffRecord: StaffRecordLike, company: CompanyLike, companyNameOverride?: string) {
  return {
    staffId: staffRecord.staffId,
    firstName: staffRecord.firstName,
    lastName: staffRecord.lastName,
    email: staffRecord.email,
    department: staffRecord.department || '',
    designation: staffRecord.position || '',
    position: staffRecord.position || '',
    companyName: companyNameOverride || company.companyName || '',
    companyAddress: company.address || '',
    companyPhone: company.phone || '',
    companyLogo: company.logo || '',
    companyTaxId: company.taxId || '',
    baseCurrency: company.baseCurrency || 'NGN'
  }
}

function companyInfo(company: CompanyLike, companyNameOverride?: string) {
  return {
    name: companyNameOverride || company.companyName || '',
    address: company.address || '',
    phone: company.phone || '',
    email: '',
    logo: company.logo || '',
    taxId: company.taxId || '',
    baseCurrency: company.baseCurrency || 'NGN'
  }
}

function buildIsurfStandardInput(payroll: PayrollLike, staffRecord: StaffRecordLike, company: CompanyLike): LegacyGeneratePayslipInput {
  const parsedRow: ParsedPayrollRow = {
    rowNumber: 0,
    staffId: staffRecord.staffId,
    email: staffRecord.email,
    fullName: `${staffRecord.firstName} ${staffRecord.lastName}`,
    periodMonth: 0,
    periodYear: 0,
    basicSalary: n(payroll.basicSalary),
    housingAllowance: n(payroll.housing),
    transportAllowance: n(payroll.transport),
    // Quirk preserved from isurf-standard.ts: the PDF's "transportation
    // allowance" line has always come from the dressing column.
    transportationAllowance: n(payroll.dressing),
    otherAllowances: n(payroll.leaveAllowance) + n(payroll.entertainment) + n(payroll.utility),
    grossPay: n(payroll.grossPay),
    payee: n(payroll.payee),
    pension: n(payroll.pensionDeduction),
    netPay: n(payroll.netSalary),
    daysInMonth: 0,
    daysWorked: 0,
    rawRow: {},
    bonusKPI: n(payroll.bonusKPI),
    deductions: n(payroll.deductions)
  }

  return {
    staff: staffInfo(staffRecord, company),
    payroll: parsedRow,
    templateType: 'ISURF_STANDARD'
  }
}

function buildBlueridgeInput(payroll: PayrollLike, staffRecord: StaffRecordLike, company: CompanyLike): EnhancedGeneratePayslipPdfInputAlias {
  const parsedRow: ParsedPayrollRow = {
    rowNumber: 0,
    staffId: staffRecord.staffId,
    email: staffRecord.email,
    fullName: `${staffRecord.firstName} ${staffRecord.lastName}`,
    periodMonth: 0,
    periodYear: 0,
    // Quirk preserved from blueridge.ts: the PDF's Basic Salary line prefers
    // the prorated figure over the raw basicSalary column when present.
    basicSalary: n(payroll.proratedGrossPay) || n(payroll.basicSalary),
    housingAllowance: n(payroll.housing),
    transportAllowance: n(payroll.transport),
    transportationAllowance: n(payroll.transportationAllowance),
    otherAllowances: n(payroll.otherAllowance),
    grossPay: n(payroll.grossPay),
    payee: n(payroll.payee),
    pension: n(payroll.pensionDeduction),
    netPay: n(payroll.netSalary),
    daysInMonth: 0,
    daysWorked: 0,
    rawRow: {},
    bonusKPI: n(payroll.bonusKPI),
    deductions: n(payroll.deductions),
    overtimeIncome: n(payroll.overtimeIncome),
    communicationAllowance: n(payroll.communicationAllowance),
    outstandingIncome: n(payroll.outstandingIncome),
    dressingAllowance: n(payroll.dressing),
    leaveAllowance: n(payroll.leaveAllowance),
    entertainmentAllowance: n(payroll.entertainment),
    utilityAllowance: n(payroll.utility),
    walletPayment: n(payroll.walletPayment),
    commercialPayment: n(payroll.commercialPayment),
    proratedGrossPay: n(payroll.proratedGrossPay),
    position: staffRecord.position || undefined
  }

  return {
    staff: staffInfo(staffRecord, company),
    payroll: parsedRow,
    companyInfo: companyInfo(company)
  }
}

type CustomFieldEntry = { value: unknown; displayName: string; dataType: string; section: string; showOnPayslip?: boolean }

function normalizeSection(section: string): string {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_')
}

function buildDynamicInput(payroll: PayrollLike, staffRecord: StaffRecordLike, company: CompanyLike, templateName?: string, payslipCompanyName?: string): EnhancedGeneratePayslipPdfInputAlias {
  const customFields = (payroll.customFields as Record<string, CustomFieldEntry> | null) || {}

  const earningsForPayslip: any[] = []
  const deductionsForPayslip: any[] = []
  const fixedValuesForPayslip: any[] = []

  Object.values(customFields).forEach((field) => {
    if (!field?.showOnPayslip) return
    const fieldSection = normalizeSection(field.section)
    const value = field.dataType === 'Number' ? Number(field.value) || 0 : field.value
    const payslipItem = { label: field.displayName, value, dataType: field.dataType, isCustom: true, section: fieldSection }
    if (fieldSection === 'FIXED_EARNINGS' || fieldSection === 'EARNINGS') {
      earningsForPayslip.push({ ...payslipItem, type: 'earnings' })
    } else if (fieldSection === 'FIXED_VALUE' || fieldSection === 'FIXED_VALUES') {
      fixedValuesForPayslip.push({ ...payslipItem, type: 'earnings', section: 'FIXED_VALUE' })
    } else if (fieldSection === 'DEDUCTIONS') {
      deductionsForPayslip.push({ ...payslipItem, type: 'deduction' })
    }
    // STAFF_DETAILS additionalStaffDetails intentionally omitted — see file header comment.
  })

  const totalEarnings = earningsForPayslip.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0)
  const totalDeductions = deductionsForPayslip.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0)
  const netPay = totalEarnings - totalDeductions

  const parsedRow: ParsedPayrollRow = {
    rowNumber: 0,
    staffId: staffRecord.staffId,
    email: staffRecord.email,
    fullName: `${staffRecord.firstName} ${staffRecord.lastName}`,
    periodMonth: 0,
    periodYear: 0,
    basicSalary: 0,
    housingAllowance: 0,
    transportAllowance: 0,
    transportationAllowance: 0,
    otherAllowances: 0,
    grossPay: totalEarnings,
    payee: 0,
    pension: 0,
    netPay,
    daysInMonth: 0,
    daysWorked: 0,
    rawRow: {},
    bonusKPI: 0,
    deductions: totalDeductions,
    overtimeIncome: 0,
    communicationAllowance: 0,
    outstandingIncome: 0,
    dressingAllowance: 0,
    leaveAllowance: 0,
    entertainmentAllowance: 0,
    utilityAllowance: 0,
    walletPayment: 0,
    commercialPayment: 0,
    proratedGrossPay: 0
  }

  return {
    staff: staffInfo(staffRecord, company, payslipCompanyName),
    payroll: parsedRow,
    companyInfo: companyInfo(company, payslipCompanyName),
    earnings: [...earningsForPayslip, ...fixedValuesForPayslip],
    deductions: deductionsForPayslip,
    summary: { grossPay: totalEarnings, totalDeductions, netPay },
    templateName,
    additionalStaffDetails: [],
    showPaymentDetails: false
  }
}

// generateEnhancedPayslipPdf's own GeneratePayslipInput isn't exported under
// a distinct alias-friendly name in its source file, so re-declare the alias
// locally for the two builder return types above.
type EnhancedGeneratePayslipPdfInputAlias = EnhancedGeneratePayslipInput

export type RegeneratePayslipPdfInput = {
  payroll: PayrollLike
  staffRecord: StaffRecordLike
  company: CompanyLike
  templateName?: string
  payslipCompanyName?: string
  // Company Payslip Preset selected on the payroll template — when the
  // preset exists and is active, the regenerated PDF uses its HTML layout.
  payslipPresetId?: string | null
  // Extra staff identifiers for preset token support ({{bankName}} etc.).
  staffBankName?: string
  staffAccountNumber?: string
  staffPfa?: string
  staffRsaPin?: string
}

// Single entry point — picks the right builder + generator for this
// Payroll row's templateType, exactly the way each upload processor does
// at upload time. Also returns the gross/net totals the PDF was rendered
// with, so a caller writing Payslip.grossPay/netPay never has to
// re-derive them (and risk drifting from what the PDF actually shows) —
// for ISURF_STANDARD/BLUERIDGE these are the stored Payroll columns; for
// DYNAMIC they're the same customFields-derived sums the PDF itself uses.
export async function regeneratePayslipPdf({
  payroll,
  staffRecord,
  company,
  templateName,
  payslipCompanyName,
  payslipPresetId,
  staffBankName,
  staffAccountNumber,
  staffPfa,
  staffRsaPin
}: RegeneratePayslipPdfInput): Promise<{ pdfBuffer: Uint8Array; fileName: string; grossPay: number; netPay: number }> {
  // Company Payslip Preset layout — when the template has an active preset
  // selected, its HTML layout replaces the built-in generators. gross/net
  // are still derived from the same stored Payroll columns as below.
  const presetHtml = await getActivePresetHtml(payslipPresetId)
  if (presetHtml) {
    const baseInput =
      payroll.templateType === 'DYNAMIC'
        ? buildDynamicInput(payroll, staffRecord, company, templateName, payslipCompanyName)
        : payroll.templateType === 'BLUERIDGE'
          ? buildBlueridgeInput(payroll, staffRecord, company)
          : buildIsurfStandardInput(payroll, staffRecord, company)
    const presetInput = {
      ...baseInput,
      payslipPresetHtml: presetHtml,
      staff: {
        ...baseInput.staff,
        bankName: staffBankName || '',
        accountNumber: staffAccountNumber || '',
        pfa: staffPfa || '',
        rsaPin: staffRsaPin || ''
      }
    } as unknown as PresetAwarePayslipInput
    const result = await generatePayslipPdfUnified(presetInput)
    const grossPay = presetInput.summary?.grossPay ?? presetInput.payroll.grossPay
    const netPay = presetInput.summary?.netPay ?? presetInput.payroll.netPay
    return { ...result, grossPay, netPay }
  }

  if (payroll.templateType === 'BLUERIDGE') {
    const input = buildBlueridgeInput(payroll, staffRecord, company)
    const result = await generateEnhancedPayslipPdf(input)
    return { ...result, grossPay: input.payroll.grossPay, netPay: input.payroll.netPay }
  }
  if (payroll.templateType === 'DYNAMIC') {
    const input = buildDynamicInput(payroll, staffRecord, company, templateName, payslipCompanyName)
    const result = await generateEnhancedPayslipPdf(input)
    return { ...result, grossPay: input.summary!.grossPay, netPay: input.summary!.netPay }
  }
  // Default / 'ISURF_STANDARD'
  const input = buildIsurfStandardInput(payroll, staffRecord, company)
  const result = await generatePayslipPdf(input)
  return { ...result, grossPay: input.payroll.grossPay, netPay: input.payroll.netPay }
}
