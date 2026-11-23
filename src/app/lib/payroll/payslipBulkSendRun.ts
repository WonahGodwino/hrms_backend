// src/app/lib/payroll/payslipBulkSendRun.ts
//
// The payslip bulk-send loop, moved unchanged out of
// api/payroll/payslips/bulk-send/route.ts (REL-001) so it can run from the
// job queue as well as from the route. See that route for the full
// description of the send-then-publish order.
import { prisma } from '@/app/lib/db'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { createRateLimiter, mapWithConcurrency } from '@/app/lib/payroll/concurrency'
import { findResumablePayslipIds, markPayslipEmailResult, markPayslipsPending } from '@/app/lib/payroll/payslip-email-status'
import {
  completePayslipBulkSendRecord,
  failPayslipBulkSendRecord,
  reportBulkSendProgress,
  type PayslipBulkSendResults,
} from '@/app/lib/payroll/payslipBulkSend'
import { forCompany } from '@/app/lib/data/tenant'

/** Mailgun message id from a send result, without angle brackets. */
function messageIdOf(result: unknown): string | null {
  const id = (result as { data?: { id?: unknown } } | null)?.data?.id
  return id ? String(id).replace(/^<|>$/g, '') : null
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const BULK_SEND_CONCURRENCY = 6
const BULK_SEND_RATE_PER_SECOND = 15

export async function processBulkSendInBackground({
  jobId,
  companyId,
  month,
  year,
  userId,
}: {
  jobId: string
  companyId: string
  month: string
  year: number
  userId: string
}) {
  const results: PayslipBulkSendResults = { sent: 0, failed: 0, emailFailures: [] }

  try {
    // Drafts, plus published payslips left PENDING/FAILED by an earlier run.
    const resumeIds = await findResumablePayslipIds(companyId, month, year)
    const payslips = await forCompany(companyId).payslip.findMany({
      where: { month,
        year,
        OR: [{ draft: true }, ...(resumeIds.length > 0 ? [{ id: { in: resumeIds } }] : [])],
      },
      // Only what the email needs — `include: { staffRecord: true }` pulled
      // whole staff rows (bank details etc.) for every payslip.
      include: {
        staffRecord: {
          select: {
            id: true, companyId: true, firstName: true, lastName: true, email: true,
            staffId: true, department: true, position: true, isRegistered: true,
          },
        },
      },
    })

    if (payslips.length === 0) {
      await completePayslipBulkSendRecord(jobId, results)
      return
    }

    const payrollIds = payslips.filter((p) => p.payrollId).map((p) => p.payrollId)
    const payrolls = payrollIds.length
      ? await prisma.payroll.findMany({
          where: { id: { in: payrollIds } },
          select: { id: true, netSalary: true, createdAt: true },
        })
      : []
    const payrollsMap = new Map(payrolls.map((p) => [p.id, p]))

    // Mark everything selected as PENDING: if the process dies from here on, the
    // unsent ones are findable and a re-run resumes exactly those. Publishing
    // (draft -> false) now happens per-payslip inside processOne, AFTER that
    // specific staff member's email attempt — not as one upfront batch
    // update — so "send, then publish" holds per staff. A payslip still
    // becomes visible whether its email succeeds or fails (a staff member
    // isn't denied their payslip because of a bad email address), but it no
    // longer appears before HR has even tried to notify them.
    await markPayslipsPending(payslips.map((p) => p.id))

    const processOne = async (payslip: (typeof payslips)[number]) => {
      const staff = payslip.staffRecord
      const staffName = `${staff.firstName} ${staff.lastName}`
      let emailSucceeded = false

      try {
        if (!staff.email) {
          throw new Error('Staff member has no email address')
        }

        const staffForEmail = {
          id: staff.id,
          companyId: staff.companyId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          staffId: staff.staffId,
          department: staff.department,
          position: staff.position,
          isRegistered: staff.isRegistered,
        }

        const payroll = payslip.payrollId ? payrollsMap.get(payslip.payrollId) : null
        const payrollForEmail = {
          id: payslip.payrollId || 'unknown',
          month: MONTH_NAMES[parseInt(payslip.month, 10) - 1] || payslip.month,
          year: payslip.year,
          netSalary: Number(payslip.netPay || payroll?.netSalary || 0),
          isUpdate: payroll?.createdAt ? payslip.createdAt > payroll.createdAt : false,
        }

        const emailResult = await sendPayrollNotificationEmail(staffForEmail, payrollForEmail)

        if (!emailResult.success) {
          throw new Error(emailResult.error || 'Failed to send email')
        }

        results.sent++
        emailSucceeded = true
        await markPayslipEmailResult(payslip.id, { success: true, messageId: messageIdOf(emailResult) })

        try {
          await prisma.emailLog.create({
            data: {
              companyId,
              staffId: staff.id,
              payrollId: payslip.payrollId,
              payslipId: payslip.id,
              emailType: 'PAYSLIP_BULK_SEND',
              recipient: staff.email,
              status: 'SENT',
              sentBy: userId,
              metadata: { month, year, messageId: messageIdOf(emailResult) },
            },
          })
        } catch (logError) {
          console.error('[PAYSLIP_BULK_SEND] Failed to write EmailLog (non-critical):', logError)
        }
      } catch (err: unknown) {
        results.failed++
        await markPayslipEmailResult(payslip.id, { success: false })
        const message = (err as { message?: string } | null)?.message || 'Failed to send email'
        results.emailFailures.push({
          payslipId: payslip.id,
          email: staff.email || '',
          staffName,
          error: message,
        })

        try {
          await prisma.emailLog.create({
            data: {
              companyId,
              staffId: staff.id,
              payrollId: payslip.payrollId,
              payslipId: payslip.id,
              emailType: 'PAYSLIP_BULK_SEND',
              recipient: staff.email || '',
              status: 'FAILED',
              sentBy: userId,
              error: message,
              metadata: { month, year },
            },
          })
        } catch (logError) {
          console.error('[PAYSLIP_BULK_SEND] Failed to write EmailLog (non-critical):', logError)
        }
      }

      // Publish regardless of email outcome — the notification attempt has
      // already been made and recorded above either way, and a staff member
      // shouldn't be denied their own payslip just because their email
      // bounced or their address was wrong. This is deliberately AFTER the
      // email attempt (not before, and not one upfront batch update), so a
      // payslip only becomes visible once HR has actually tried to notify
      // that specific staff member.
      try {
        await prisma.payslip.update({ where: { id: payslip.id }, data: { draft: false } })
      } catch (publishError) {
        // Distinct from an email failure: the notification went out (or was
        // attempted) but the payslip may still be hidden from the staff
        // member. Left as draft:true, so the next bulk-send run for this
        // period picks it up and retries publishing automatically.
        console.error('[PAYSLIP_BULK_SEND] Failed to publish payslip after send attempt:', {
          payslipId: payslip.id,
          staffId: staff.id,
          error: publishError,
        })
        results.emailFailures.push({
          payslipId: payslip.id,
          email: staff.email || '',
          staffName,
          error: emailSucceeded
            ? 'Email sent, but the payslip failed to publish — it is still hidden from the staff member. Re-run bulk send to retry.'
            : 'Email failed and the payslip failed to publish — it is still hidden from the staff member. Re-run bulk send to retry.',
        })
      }
    }

    // Bounded concurrency + a global rate cap: ~6 in flight and at most ~15
    // sends/second keeps 3,000 emails to a few minutes without hammering the
    // provider. Progress is persisted every 25 sends so status is live and the
    // stale check sees activity.
    const acquireSlot = createRateLimiter(BULK_SEND_RATE_PER_SECOND)
    let completed = 0
    await mapWithConcurrency(payslips, BULK_SEND_CONCURRENCY, async (payslip) => {
      await acquireSlot()
      await processOne(payslip)
      completed++
      if (completed % 25 === 0) await reportBulkSendProgress(jobId, results)
    })

    await completePayslipBulkSendRecord(jobId, results)

    console.log('[PAYSLIP_BULK_SEND] Completed successfully', {
      jobId,
      companyId,
      month,
      year,
      sent: results.sent,
      failed: results.failed,
    })
  } catch (processingError: unknown) {
    console.error('[PAYSLIP_BULK_SEND] Processing error:', { jobId, error: processingError })
    await failPayslipBulkSendRecord(jobId, (processingError as { message?: string } | null)?.message || 'Unknown processing error')
  }
}
