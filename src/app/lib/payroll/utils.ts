// src/app/lib/payroll/utils.ts
import type {
  CustomFieldValue, 
  PayslipDisplayItem,
  } from './templates/types'
import { calculateTotals, normalizeSection } from '@/app/lib/payroll/templates/utils'
export { calculateTotals }



/**
 * Get fields marked for payslip display from custom fields
 */
export function getPayslipDisplayFields(
  customFields: Record<string, CustomFieldValue>
): {
  earnings: PayslipDisplayItem[]
  deductions: PayslipDisplayItem[]
} {
  const earnings: PayslipDisplayItem[] = []
  const deductions: PayslipDisplayItem[] = []

  if (!customFields) return { earnings, deductions }

  Object.entries(customFields).forEach(([, field]) => {
    if (!field.showOnPayslip) return;

    const normalizedSection = normalizeSection(field.section);
    const isEarning = normalizedSection === 'EARNINGS' || normalizedSection === 'FIXED_EARNINGS';
    const isDeduction = normalizedSection === 'DEDUCTIONS';
    // Now both EARNINGS and FIXED_EARNINGS are included in earnings
    if (!isEarning && !isDeduction) return; // skip STAFF_DETAILS, etc.

    // Parse value to number
    let value = 0;
    if (typeof field.value === 'number') {
      value = field.value;
    } else if (typeof field.value === 'string') {
      value = parseFloat(field.value) || 0;
    } else {
      value = Number(field.value) || 0;
    }

    if (value <= 0) return;

    const item: PayslipDisplayItem = {
      label: field.displayName,
      value,
      dataType: field.dataType,
      isCustom: true,
      section: normalizedSection,
      type: isDeduction ? 'deduction' : 'earnings'
    };

    if (isDeduction) {
      deductions.push(item);
    } else if (isEarning) {
      earnings.push(item);
    }
  });

  // Sort earnings: Fixed Earnings first, then by label
  earnings.sort((a, b) => {
    if (a.section === 'FIXED_EARNINGS' && b.section !== 'FIXED_EARNINGS') return -1
    if (a.section !== 'FIXED_EARNINGS' && b.section === 'FIXED_EARNINGS') return 1
    return a.label.localeCompare(b.label)
  })

  // Sort deductions by label
  deductions.sort((a, b) => a.label.localeCompare(b.label))

  return { earnings, deductions }
}

/**
 * Read a single custom field's numeric value by systemField key. customFields
 * is keyed directly by systemField (see dynamic-processor.ts), so this is a
 * plain lookup rather than a scan - used to pull one line item (e.g. the
 * 'pension' or 'employer_pension' field) out of a DYNAMIC payroll row,
 * as opposed to getPayslipDisplayFields/calculateTotals which only produce
 * grand totals.
 */
export function getCustomFieldValue(
  customFields: Record<string, CustomFieldValue> | null | undefined,
  systemField: string
): number | null {
  const field = customFields?.[systemField]
  if (!field) return null

  if (typeof field.value === 'number') return field.value
  if (typeof field.value === 'string') {
    const parsed = parseFloat(field.value)
    return Number.isNaN(parsed) ? null : parsed
  }
  const coerced = Number(field.value)
  return Number.isNaN(coerced) ? null : coerced
}



