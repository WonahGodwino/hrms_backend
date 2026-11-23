
import { getRelativePath } from '@/app/lib/storage/relative-path'
export { getRelativePath }

// Case/space/punctuation-insensitive key for a header or label, so a sheet's
// human-readable header ("Maximum Days Per Year") and the machine key
// ("maxDays") can both resolve to the same column. "*" (required marker) is
// ignored. This is what lets the template show friendly headers while the
// importer still recognises them \u2014 and keeps older key-headed sheets working.
export function slugHeader(text: unknown): string {
  return String(text ?? '')
    .replace(/\u00A0/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Column definition shared by the template writer and the importer: `label`
// is the human header shown in the sheet, `key` is what the code reads. A
// header cell matches a column when its slug equals the label's OR the key's,
// so both the friendly header and the raw key are accepted.
export type ColumnSpec = { key: string; label: string; required?: boolean; width: number }

// Leave Types sheet \u2014 no `color` (auto-assigned by the system) and no
// approval columns (approval is set per leave type in the Leave Settings UI).
export const LEAVE_TYPE_COLUMNS: ColumnSpec[] = [
  { key: 'policyName', label: 'Policy Name', required: true, width: 24 },
  { key: 'typeName', label: 'Leave Type Name', required: true, width: 24 },
  { key: 'code', label: 'Short Code', required: true, width: 12 },
  { key: 'description', label: 'Description', width: 34 },
  { key: 'isActive', label: 'Active', width: 12 },
]

// Leave Policies sheet \u2014 no `requiresApproval` (all leave needs approval) and
// no `approvalWorkflow` (set per leave type in the UI, not the sheet).
export const LEAVE_POLICY_COLUMNS: ColumnSpec[] = [
  { key: 'policyName', label: 'Policy Name', required: true, width: 24 },
  { key: 'description', label: 'Description', width: 34 },
  { key: 'maxDays', label: 'Maximum Days Per Year', required: true, width: 20 },
  { key: 'carryOver', label: 'Carry-Over Days', width: 16 },
  { key: 'isPaid', label: 'Paid Leave', width: 12 },
  { key: 'accrualRate', label: 'Monthly Accrual Rate', width: 18 },
  { key: 'minEmploymentMonths', label: 'Minimum Employment (Months)', width: 24 },
  { key: 'noticePeriod', label: 'Notice Period (Days)', width: 18 },
  { key: 'documentationRequired', label: 'Documentation Required', width: 22 },
  { key: 'documentationTiming', label: 'Documentation Timing', width: 22 },
  { key: 'allowHalfDays', label: 'Allow Half Days', width: 16 },
  { key: 'maxConsecutiveDays', label: 'Maximum Consecutive Days', width: 22 },
  { key: 'seasonalRestrictions', label: 'Seasonal Restriction Months', width: 24 },
  { key: 'requireManagerComments', label: 'Require Manager Comments', width: 24 },
]

// System-assigned leave-type colours \u2014 HR shouldn't have to pick hex codes, so
// one is chosen deterministically from the type's code (stable across re-imports).
export const LEAVE_TYPE_PALETTE = ['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#0EA5E9', '#D946EF']
export function autoLeaveTypeColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return LEAVE_TYPE_PALETTE[hash % LEAVE_TYPE_PALETTE.length]
}

// A 2-4 char uppercase code from a policy/type name: initials of the words,
// e.g. "Annual Leave" -> "AL", "Sick Leave" -> "SL". Falls back to the first
// letters when a single short word can't make two initials.
export function deriveLeaveCode(name: string): string {
  const words = name.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  let code = words.map((w) => w[0]).join('').toUpperCase()
  if (code.length < 2) code = (name.replace(/[^A-Za-z0-9]/g, '').toUpperCase() + 'XX').slice(0, 2)
  return code.slice(0, 4)
}

// Header shown in the sheet: friendly label, with " *" appended when required.
export const columnHeader = (c: ColumnSpec) => `${c.label}${c.required ? ' *' : ''}`

// "After Leave" / "AFTER_LEAVE" / "Later" → AFTER_LEAVE (apply now, submit the
// document later). Anything else (incl. empty) → AT_APPLICATION (the default:
// document must be provided when applying).
export function normalizeDocTiming(v: unknown): 'AT_APPLICATION' | 'AFTER_LEAVE' {
  const s = slugHeader(v)
  if (['afterleave', 'after', 'later', 'defer', 'deferred'].includes(s)) return 'AFTER_LEAVE'
  return 'AT_APPLICATION'
}


