// src/app/lib/payroll/payslip-email-status.ts
//
// Per-payslip email status (payslips.emailStatus / emailSentAt / emailMessageId),
// which lets a crashed or interrupted bulk send resume and lets the Mailgun
// webhook match events to a payslip.
//
// These columns come from the PROPOSED migration in
// prisma/proposed-migrations/20261110000000_payroll_scale_indexes_and_email_status
// and are not in schema.prisma yet, so everything here goes through raw SQL and
// first checks that the columns exist. Until the migration is applied every
// function is a harmless no-op and callers keep their current behaviour; once it
// is applied, resume support switches on without a code change.
//
// Status values:
//   'PENDING' - selected for a send that has started (resume candidate)
//   'SENT'    - Mailgun accepted it
//   'FAILED'  - send failed or permanently bounced (resume candidate)
//   NULL      - never attempted by this mechanism (e.g. published before the
//               columns existed). NULL is deliberately NOT treated as unsent, so
//               applying the migration never triggers a mass re-send.
import { prisma } from '@/app/lib/db'

const EXISTS_TTL_MS = 5 * 60 * 1000
const MISSING_TTL_MS = 60 * 1000 // re-check soon so applying the migration takes effect quickly

let cached: { value: boolean; expires: number } | null = null

/** True when the three email-status columns exist on payslips. Cached briefly. */
export async function hasEmailStatusColumns(): Promise<boolean> {
  if (cached && cached.expires > Date.now()) return cached.value
  let value = false
  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'payslips'
        AND column_name IN ('emailStatus', 'emailSentAt', 'emailMessageId')`
    value = rows.length === 3
  } catch (error) {
    console.error('[PAYSLIP_EMAIL_STATUS] Column check failed (treating as absent):', error)
  }
  cached = { value, expires: Date.now() + (value ? EXISTS_TTL_MS : MISSING_TTL_MS) }
  return value
}

/** Test hook: forget the cached column check. */
export function resetEmailStatusColumnCache() {
  cached = null
}

/** Marks payslips as selected for a send in progress. No-op without the columns. */
export async function markPayslipsPending(payslipIds: string[]): Promise<void> {
  if (payslipIds.length === 0 || !(await hasEmailStatusColumns())) return
  try {
    await prisma.$executeRaw`UPDATE "payslips" SET "emailStatus" = 'PENDING' WHERE "id" = ANY(${payslipIds})`
  } catch (error) {
    console.error('[PAYSLIP_EMAIL_STATUS] Failed to mark pending (non-critical):', error)
  }
}

/** Records the outcome of one send. Never throws; no-op without the columns. */
export async function markPayslipEmailResult(
  payslipId: string | null | undefined,
  result: { success: boolean; messageId?: string | null }
): Promise<void> {
  if (!payslipId || !(await hasEmailStatusColumns())) return
  try {
    if (result.success) {
      await prisma.$executeRaw`
        UPDATE "payslips"
        SET "emailStatus" = 'SENT', "emailSentAt" = NOW(), "emailMessageId" = ${result.messageId ?? null}
        WHERE "id" = ${payslipId}`
    } else {
      await prisma.$executeRaw`UPDATE "payslips" SET "emailStatus" = 'FAILED' WHERE "id" = ${payslipId}`
    }
  } catch (error) {
    console.error('[PAYSLIP_EMAIL_STATUS] Failed to record result (non-critical):', error)
  }
}

/** A permanent bounce/complaint reported by the webhook turns that payslip's status to FAILED. */
export async function markPayslipEmailFailedByMessageId(messageId: string): Promise<void> {
  if (!messageId || !(await hasEmailStatusColumns())) return
  try {
    await prisma.$executeRaw`UPDATE "payslips" SET "emailStatus" = 'FAILED' WHERE "emailMessageId" = ${messageId}`
  } catch (error) {
    console.error('[PAYSLIP_EMAIL_STATUS] Failed to mark bounce (non-critical):', error)
  }
}

/**
 * Published payslips for a company/period whose email did not complete
 * (PENDING = a send was interrupted, FAILED = it failed or bounced). Empty
 * without the columns. These, plus the still-draft ones, are what a resumed
 * bulk send picks up.
 */
export async function findResumablePayslipIds(companyId: string, month: string, year: number): Promise<string[]> {
  if (!(await hasEmailStatusColumns())) return []
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "payslips"
      WHERE "companyId" = ${companyId} AND "month" = ${month} AND "year" = ${year}
        AND "draft" = false AND "emailStatus" IN ('PENDING', 'FAILED')`
    return rows.map((r) => r.id)
  } catch (error) {
    console.error('[PAYSLIP_EMAIL_STATUS] Failed to find resumable payslips (non-critical):', error)
    return []
  }
}
