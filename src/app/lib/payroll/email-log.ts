// src/app/lib/payroll/email-log.ts
//
// Single place that records a payslip email attempt in EmailLog so the
// "Payslip Email Delivery" page reflects every send, not only bulk-send and
// resend. Payroll upload / generation emails used to report SENT or FAILED to
// the screen and then drop the result, so the delivery history could not be
// trusted.
//
// Recording is best-effort: a logging failure must never fail or roll back
// payroll processing.
import { prisma } from '@/app/lib/db'
import { markPayslipEmailResult } from '@/app/lib/payroll/payslip-email-status'

export type PayslipEmailType =
  | 'PAYSLIP_UPLOAD' // sent while processing an uploaded payroll file
  | 'PAYSLIP_GENERATED' // sent when a generated payroll run is approved
  | 'PAYSLIP_BULK_SEND'
  | 'PAYSLIP_RESEND'

/** Every emailType the delivery page / logs API treats as a payslip email. */
export const PAYSLIP_EMAIL_TYPES: PayslipEmailType[] = [
  'PAYSLIP_UPLOAD',
  'PAYSLIP_GENERATED',
  'PAYSLIP_BULK_SEND',
  'PAYSLIP_RESEND',
]

export type PayslipEmailAttempt = {
  companyId: string
  /** StaffRecord.id (not the human staffId). */
  staffId: string
  payslipId?: string | null
  payrollId?: string | null
  recipient: string | null | undefined
  emailType: PayslipEmailType
  success: boolean
  error?: string | null
  sentBy?: string | null
  month?: string
  year?: number
  /** Mailgun message id of an accepted send; lets the delivery webhook match events. */
  messageId?: string | null
}

/** Mailgun ids arrive as "<id@domain>" in the API and "id@domain" in webhooks. */
export function normalizeMessageId(id: string | null | undefined): string | null {
  const cleaned = String(id ?? '').trim().replace(/^<|>$/g, '')
  return cleaned || null
}

export async function logPayslipEmailAttempt(attempt: PayslipEmailAttempt): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        companyId: attempt.companyId,
        staffId: attempt.staffId,
        payslipId: attempt.payslipId ?? null,
        payrollId: attempt.payrollId ?? null,
        emailType: attempt.emailType,
        recipient: attempt.recipient || '',
        status: attempt.success ? 'SENT' : 'FAILED',
        sentBy: attempt.sentBy ?? null,
        error: attempt.success ? null : String(attempt.error || 'Email sending failed').slice(0, 1000),
        metadata: { month: attempt.month ?? null, year: attempt.year ?? null, messageId: normalizeMessageId(attempt.messageId) },
      },
    })
    // Keep the per-payslip status in step (no-op until the email-status columns exist).
    await markPayslipEmailResult(attempt.payslipId, { success: attempt.success, messageId: normalizeMessageId(attempt.messageId) })
  } catch (logError) {
    console.error('[PAYSLIP_EMAIL_LOG] Failed to write EmailLog (non-critical):', logError)
  }
}
