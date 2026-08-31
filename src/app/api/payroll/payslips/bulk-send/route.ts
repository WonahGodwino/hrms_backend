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
import {
  getActivePayslipBulkSend,
  createPendingPayslipBulkSend,
  completePayslipBulkSendRecord,
  failPayslipBulkSendRecord,
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
    if (draftCount === 0) {
      return withCors(
        ApiResponse.error(`No draft payslips found for ${month} ${yearNumber}.`, 400),
        origin
      )
    }

    const job = await createPendingPayslipBulkSend(companyId, month, yearNumber, user.userId, draftCount)

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
      totalPayslips: draftCount,
    })

    return withCors(
      ApiResponse.success(
        { jobId: job.id, status: 'PROCESSING', totalPayslips: draftCount },
        'Payslip bulk-send started'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

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
    const payslips = await prisma.payslip.findMany({
      where: { companyId, month, year, draft: true },
      include: { staffRecord: true },
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

    for (const payslip of payslips) {
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
              metadata: { month, year },
            },
          })
        } catch (logError) {
          console.error('[PAYSLIP_BULK_SEND] Failed to write EmailLog (non-critical):', logError)
        }
      } catch (err: any) {
        results.failed++
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
