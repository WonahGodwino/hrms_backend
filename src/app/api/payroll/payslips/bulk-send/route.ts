// src/app/api/payroll/payslips/bulk-send/route.ts
//
// POST — publishes (draft → false) and emails every draft payslip for a
// given company + month + year in one action. The company scope always comes
// from the current company in view on the frontend, matching how the rest of
// the app works — there's no cross-company "send for all companies" option.
//
// Counting draft payslips is fast and happens synchronously so an empty
// result gets an immediate 400. Actually sending — up to thousands of emails
// — happens in the background after the response is sent, the same async
// pattern used for payroll uploads and staff bulk-edit, to avoid the request
// timing out. Poll GET /payroll/payslips/bulk-send/status/[id] for progress.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { consumeTrialQuota } from '@/app/lib/trial/guard'
import { createRateLimiter, mapWithConcurrency } from '@/app/lib/payroll/concurrency'
import { findResumablePayslipIds, markPayslipEmailResult, markPayslipsPending } from '@/app/lib/payroll/payslip-email-status'
import {
  getActivePayslipBulkSend,
  createPendingPayslipBulkSend,
  completePayslipBulkSendRecord,
  failPayslipBulkSendRecord,
  reportBulkSendProgress,
  type PayslipBulkSendResults,
} from '@/app/lib/payroll/payslipBulkSend'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const body = await request.json()
    const { companyId, month, year } = body as { companyId?: string; month?: string; year?: number | string }

    if (!companyId || !month || !year) {
      return withCors(ApiResponse.error('companyId, month and year are required', 400), origin)
    }

    const yearNumber = typeof year === 'string' ? parseInt(year, 10) : year
    if (Number.isNaN(yearNumber)) {
      return withCors(ApiResponse.error('Invalid year', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const company = await prisma.company.findFirst({ where: { id: companyId, archived: 0 }, select: { id: true } })
    if (!company) {
      return withCors(ApiResponse.error('Company not found or is archived', 404), origin)
    }

    // Only one bulk-send may be in flight per company at a time.
    const activeJob = await getActivePayslipBulkSend(companyId)
    if (activeJob) {
      return withCors(
        ApiResponse.error(
          'A payslip bulk-send is already being processed for this company. Please wait for it to finish before starting another.',
          409
        ),
        origin
      )
    }

    const draftCount = await prisma.payslip.count({ where: { companyId, month, year: yearNumber, draft: true } })
    // Published payslips whose email never completed (an interrupted or failed
    // earlier send) are picked up again too. Empty until the email-status
    // columns exist, so behaviour is unchanged before the migration.
    const resumableCount = (await findResumablePayslipIds(companyId, month, yearNumber)).length
    const totalToSend = draftCount + resumableCount
    if (totalToSend === 0) {
      return withCors(
        ApiResponse.error(`No draft or unsent payslips found for ${month} ${yearNumber}.`, 400),
        origin
      )
    }

    // Free trial: payslips sent are a lifetime quota, counted by recipient.
    const draftRecipients = await prisma.payslip.findMany({
      where: { companyId, month, year: yearNumber, draft: true },
      select: { staffRecordId: true },
    })
    await consumeTrialQuota(companyId, 'payslips', draftRecipients.map((p) => p.staffRecordId))

    const job = await createPendingPayslipBulkSend(companyId, month, yearNumber, user.userId, totalToSend)

    // Respond immediately; the actual send loop continues after the response
    // is sent. This process is a long-running Node server (not a serverless
    // function), so the event loop keeps running this work after the request
    // completes.
    processBulkSendInBackground({
      jobId: job.id,
      companyId,
      month,
      year: yearNumber,
      userId: user.userId,
    }).catch((err) => {
      console.error('[PAYSLIP_BULK_SEND] Unhandled background processing error:', err)
    })

    console.log('[PAYSLIP_BULK_SEND] Accepted, processing in background', {
      jobId: job.id,
      companyId,
      month,
      year: yearNumber,
      totalPayslips: totalToSend,
    })

    return withCors(
      ApiResponse.success(
        { jobId: job.id, status: 'PROCESSING', totalPayslips: totalToSend },
        'Payslip bulk-send started'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

const BULK_SEND_CONCURRENCY = 6
const BULK_SEND_RATE_PER_SECOND = 15

async function processBulkSendInBackground({
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
    const payslips = await prisma.payslip.findMany({
      where: {
        companyId,
        month,
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

    // Publish first, as a single batch update — sending is the HR/Admin
    // approval action, so these payslips become visible to staff as soon as
    // the batch is accepted, independent of whether each notification email
    // below actually succeeds.
    await prisma.payslip.updateMany({
      where: { id: { in: payslips.map((p) => p.id) }, companyId },
      data: { draft: false },
    })
    // Mark everything selected as PENDING: if the process dies from here on, the
    // unsent ones are findable and a re-run resumes exactly those.
    await markPayslipsPending(payslips.map((p) => p.id))

    const processOne = async (payslip: (typeof payslips)[number]) => {
      const staff = payslip.staffRecord
      const staffName = `${staff.firstName} ${staff.lastName}`

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
        await markPayslipEmailResult(payslip.id, { success: true, messageId: (emailResult as any)?.data?.id ? String((emailResult as any).data.id).replace(/^<|>$/g, '') : null })

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
              metadata: { month, year, messageId: (emailResult as any)?.data?.id ? String((emailResult as any).data.id).replace(/^<|>$/g, '') : null },
            },
          })
        } catch (logError) {
          console.error('[PAYSLIP_BULK_SEND] Failed to write EmailLog (non-critical):', logError)
        }
      } catch (err: any) {
        results.failed++
        await markPayslipEmailResult(payslip.id, { success: false })
        const message = err?.message || 'Failed to send email'
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
  } catch (processingError: any) {
    console.error('[PAYSLIP_BULK_SEND] Processing error:', { jobId, error: processingError })
    await failPayslipBulkSendRecord(jobId, processingError.message || 'Unknown processing error')
  }
}
