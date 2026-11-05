// src/app/lib/staff/pension-fields.ts
//
// The pension columns shared by the staff upload template, the bulk-edit sheet, the
// records export and their two upload parsers, so a column added here shows up and is read
// back everywhere. Start date is deliberately not one of them: it is stamped automatically
// on upload and edited on the staff record itself.
import type ExcelJS from 'exceljs'
import { prisma } from '@/app/lib/db'

export const STAFF_PENSION_COLUMNS = [
  { header: 'rsaPin', key: 'rsaPin', width: 18, align: 'left' as const },
  { header: 'pfaCode', key: 'pfaCode', width: 14, align: 'left' as const },
]

export const STAFF_GROSS_COLUMN = { header: 'gross', key: 'gross', width: 16, align: 'left' as const }

export const PENSION_SAMPLE = {
  rsaPin: 'PEN100123456789',
  pfaCode: 'ARM',
}

export const PENSION_NOTES = [
  'gross: Optional, monthly gross pay, saved to the staff Compensation profile',
  'rsaPin: Optional, the staff member\'s Retirement Savings Account PIN. Must start with PEN followed by digits (e.g. PEN100123456789).',
  'pfaCode: Optional, the staff member\'s Pension Fund Administrator code. Must be one of the codes listed on the "PFA List" sheet.',
  'Start date is set automatically to the upload date and can be edited later from the staff record',
]

const RSA_PIN_ALIASES = ['rsaPin', 'RSA PIN', 'RSA Pin', 'RSAPIN']
const PFA_CODE_ALIASES = ['pfaCode', 'PFA Code', 'PFA code', 'PFACODE']

/**
 * Canonical "pension capture" fields on a company's payroll template field
 * catalog (PayrollTemplateField, valueSource MANUAL) — pension contribution
 * type plus voluntary EE/ER and other contribution, captured per payroll run
 * instead of as a one-time Staff Management setup field. The systemField
 * values are fixed so every consumer (the review drawer's dropdown, the
 * missing-fields warning, the Pension Schedule report) can reliably find
 * them in a Payroll row's customFields regardless of which company added
 * them or how (auto-injected when a pension SYSTEM_CALC is present, or via
 * the manual fallback in the template builder).
 */
export const MANUAL_PENSION_CAPTURE_FIELDS = [
  { systemField: 'pensionContributionType', displayName: 'Pension Contribution Type', dataType: 'Text' as const },
  { systemField: 'voluntaryPensionEmployee', displayName: 'Voluntary Pension (Employee)', dataType: 'Number' as const },
  { systemField: 'voluntaryPensionEmployer', displayName: 'Voluntary Pension (Employer)', dataType: 'Number' as const },
  { systemField: 'otherPensionContribution', displayName: 'Other Pension Contribution', dataType: 'Number' as const },
]

export const MANUAL_PENSION_CAPTURE_SYSTEM_FIELDS = MANUAL_PENSION_CAPTURE_FIELDS.map((f) => f.systemField)

// RSA PINs are always "PEN" followed by digits (case-insensitive on input,
// normalized to uppercase on save) — matches PENSION_SAMPLE.rsaPin above.
const RSA_PIN_PATTERN = /^PEN\d+$/

export function normalizeRsaPin(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidRsaPin(value: string): boolean {
  return RSA_PIN_PATTERN.test(value)
}

/**
 * Globally-active PFA codes minus the ones a given company has disabled for
 * itself (see CompanyDisabledPfa). Shared by loadActivePfaCodes and
 * getEffectivePfaList so the "active minus company-disabled" filter lives in
 * one place.
 */
async function effectivePfas(companyId: string): Promise<{ code: string; name: string }[]> {
  const [active, disabled] = await Promise.all([
    prisma.pensionFundAdministrator.findMany({ where: { isActive: true }, select: { code: true, name: true } }),
    prisma.companyDisabledPfa.findMany({ where: { companyId }, select: { pfaCode: true } }),
  ])
  const disabledCodes = new Set(disabled.map((d) => d.pfaCode))
  return active.filter((p) => !disabledCodes.has(p.code))
}

/**
 * Active PFA codes for a company (global isActive minus that company's
 * CompanyDisabledPfa rows), fetched once per upload/edit and passed into
 * parsePensionRow/callers — not per row. companyId is required: every
 * current caller already has it in scope, so an optional param that nobody
 * omits would just be a trap for a future caller who forgets.
 */
export async function loadActivePfaCodes(companyId: string): Promise<Set<string>> {
  const pfas = await effectivePfas(companyId)
  return new Set(pfas.map((p) => p.code))
}

/** Same filter as loadActivePfaCodes, but with names too — for dropdown/admin-UI consumers. */
export async function getEffectivePfaList(companyId: string): Promise<{ code: string; name: string }[]> {
  return effectivePfas(companyId)
}

/**
 * The staff at a company who currently hold a PFA code that company has
 * since disabled. Single source of truth for every "PFA disabled but still
 * in use" warning surface (Staff Management, the pension report, and the
 * payroll generation/upload block) so they can never disagree with each
 * other.
 */
export async function findCompanyDisabledCodesInUse(
  companyId: string
): Promise<{ pfaCode: string; staff: { id: string; staffId: string; name: string }[] }[]> {
  const disabled = await prisma.companyDisabledPfa.findMany({ where: { companyId }, select: { pfaCode: true } })
  const disabledCodes = disabled.map((d) => d.pfaCode)
  if (disabledCodes.length === 0) return []

  const staff = await prisma.staffRecord.findMany({
    where: { companyId, isActive: true, pfaCode: { in: disabledCodes } },
    select: { id: true, staffId: true, firstName: true, lastName: true, pfaCode: true },
  })

  const byCode = new Map<string, { id: string; staffId: string; name: string }[]>()
  for (const s of staff) {
    const code = s.pfaCode as string
    const list = byCode.get(code) ?? []
    list.push({ id: s.id, staffId: s.staffId, name: `${s.firstName} ${s.lastName}`.trim() })
    byCode.set(code, list)
  }

  return disabledCodes
    .filter((code) => byCode.has(code))
    .map((pfaCode) => ({ pfaCode, staff: byCode.get(pfaCode)! }))
}

/**
 * Adds a real in-cell Excel dropdown for the pfaCode column of a generated
 * template (staff upload / bulk-edit), backed by a hidden "PFA List" sheet —
 * a plain comma-separated formulae list risks Excel's 255-character limit
 * once there are more than a handful of PFAs, so the list lives on its own
 * sheet and the dropdown references that range instead.
 *
 * `column` is the 1-based column index of pfaCode in the template's own
 * column layout (callers compute this from their own `columns` array so a
 * reordered template doesn't silently point the dropdown at the wrong cells).
 */
export async function addPfaDropdown(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  opts: { column: number; firstRow: number; lastRow: number; companyId: string }
): Promise<void> {
  const pfas = (await effectivePfas(opts.companyId)).sort((a, b) => a.code.localeCompare(b.code))
  if (pfas.length === 0) return

  const listSheet = workbook.addWorksheet('PFA List', { state: 'veryHidden' })
  pfas.forEach((p, i) => {
    listSheet.getCell(i + 1, 1).value = p.code
  })

  const formula = `'PFA List'!$A$1:$A$${pfas.length}`
  for (let row = opts.firstRow; row <= opts.lastRow; row++) {
    worksheet.getCell(row, opts.column).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Invalid PFA code',
      error: 'Pick a PFA from the dropdown list.',
    }
  }
}

/**
 * Reads the pension columns out of one uploaded row. Blank cells are left out (so a bulk edit
 * never wipes a stored value) and invalid values throw a row-level message.
 *
 * `pfaCodes` is the active PFA code set (see loadActivePfaCodes) — callers fetch it once and
 * pass it in rather than this function hitting the DB per row.
 */
export function parsePensionRow(
  row: any,
  pick: (row: any, keys: string[]) => unknown,
  cellToString: (value: any) => string,
  pfaCodes: Set<string>
): Record<string, string | number> {
  const out: Record<string, string | number> = {}

  const rsaPinRaw = cellToString(pick(row, RSA_PIN_ALIASES))
  if (rsaPinRaw) {
    const rsaPin = normalizeRsaPin(rsaPinRaw)
    if (!isValidRsaPin(rsaPin)) {
      throw new Error(`Invalid RSA PIN "${rsaPinRaw}" for rsaPin. Must start with PEN followed by digits (e.g. PEN100123456789).`)
    }
    out.rsaPin = rsaPin
  }

  const pfaCodeRaw = cellToString(pick(row, PFA_CODE_ALIASES))
  if (pfaCodeRaw) {
    const pfaCode = pfaCodeRaw.trim().toUpperCase()
    if (!pfaCodes.has(pfaCode)) {
      throw new Error(`Invalid PFA code "${pfaCodeRaw}" for pfaCode. Use one of: ${Array.from(pfaCodes).sort().join(', ')}.`)
    }
    out.pfaCode = pfaCode
  }

  return out
}

/**
 * Active staff at a company whose most recent payroll run captured at least
 * one of the canonical pension-capture fields (meaning the company's payroll
 * template has opted into MANUAL_PENSION_CAPTURE_FIELDS for that run) but
 * left at least one of those present fields blank. Companies that have
 * never added these fields to any template never show up here at all — this
 * stays fully dormant until a company opts in, by design (no noise for
 * everyone else). Single source of truth for the Staff Management warning
 * and the payroll generation/upload informational banners, so they can never
 * disagree with each other.
 */
export async function findStaffMissingManualPensionFields(
  companyId: string
): Promise<{ id: string; staffId: string; name: string }[]> {
  const staff = await prisma.staffRecord.findMany({
    where: { companyId, isActive: true },
    select: { id: true, staffId: true, firstName: true, lastName: true },
  })
  if (staff.length === 0) return []

  const payrolls = await prisma.payroll.findMany({
    where: { staffRecordId: { in: staff.map((s) => s.id) } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { staffRecordId: true, customFields: true },
  })

  // First payroll seen per staff (after the desc ordering above) is their
  // most recent run.
  const latestByStaff = new Map<string, Record<string, { value?: unknown }> | null>()
  for (const p of payrolls) {
    if (!latestByStaff.has(p.staffRecordId)) {
      latestByStaff.set(p.staffRecordId, p.customFields as Record<string, { value?: unknown }> | null)
    }
  }

  const missing: { id: string; staffId: string; name: string }[] = []
  for (const s of staff) {
    const customFields = latestByStaff.get(s.id)
    if (!customFields) continue
    const configuredKeys = MANUAL_PENSION_CAPTURE_SYSTEM_FIELDS.filter((key) => key in customFields)
    if (configuredKeys.length === 0) continue
    const hasMissing = configuredKeys.some((key) => {
      const value = customFields[key]?.value
      return value === undefined || value === null || value === ''
    })
    if (hasMissing) missing.push({ id: s.id, staffId: s.staffId, name: `${s.firstName} ${s.lastName}`.trim() })
  }
  return missing
}
