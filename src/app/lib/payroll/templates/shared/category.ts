// Pure helper, kept out of row-writer.ts so the validator can use it without pulling in Prisma.
/**
 * Canonicalizes a free-text payslip category so "Transport Allowance",
 * "transport-allowance" and "TRANSPORT_ALLOWANCE" all collapse to one key.
 * Without this, the new uniqueness guarantee (keyed on this value) would
 * silently fragment into duplicate rows the moment someone varies casing —
 * the exact bug this restructure exists to close, reappearing as fan-out
 * instead of overwrite.
 */
export function normalizePayslipCategory(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return 'SALARY'
  return trimmed.toUpperCase().replace(/[\s-]+/g, '_')
}
