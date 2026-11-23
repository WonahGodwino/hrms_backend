// src/app/api/payroll/payslips/bulk-send/route.ts
//
// POST — emails and publishes (draft → false) every draft payslip for a
// given company + month + year in one action. Per staff member, the
// notification email is attempted FIRST, then that specific payslip is
// published — regardless of whether the email succeeded — so a staff
// member's payslip only appears in their dashboard once HR has actually
// tried to notify them, but isn't withheld just because their own email
// bounced. The company scope always comes from the current company in view
// on the frontend, matching how the rest of the app works — there's no
// cross-company "send for all companies" option.
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
import { consumeTrialQuota } from '@/app/lib/trial/guard'
import { findResumablePayslipIds } from '@/app/lib/payroll/payslip-email-status'
import { getActivePayslipBulkSend, createPendingPayslipBulkSend } from '@/app/lib/payroll/payslipBulkSend'
import { processBulkSendInBackground } from '@/app/lib/payroll/payslipBulkSendRun'
import { enqueueJob, JOB_QUEUES } from '@/app/lib/jobs/queue'
import { toMonthName } from '@/app/lib/payroll/utils/valueParsing'
import { forCompany } from '@/app/lib/data/tenant'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { bulkSendBodySchema } from '@/app/lib/validation/payroll-staff-schemas'

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

    const parsedBody = await readJsonBody(request, bulkSendBodySchema)
    if (!parsedBody.ok) return withCors(ApiResponse.error(parsedBody.message, 400), origin)
    const body = parsedBody.data
    const { companyId, month: monthInput, year } = body as { companyId?: string; month?: string; year?: number | string }

    if (!companyId || !monthInput || !year) {
      return withCors(ApiResponse.error('companyId, month and year are required', 400), origin)
    }
    // DB-004: payslips store month names; accept "10" or "Oct" too.
    const month = toMonthName(monthInput)
    if (!month) return withCors(ApiResponse.error('month must be a month name or number (e.g. October or 10)', 400), origin)

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

    const draftCount = await forCompany(companyId).payslip.count({ where: { month, year: yearNumber, draft: true } })
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
    const draftRecipients = await forCompany(companyId).payslip.findMany({
      where: { month, year: yearNumber, draft: true },
      select: { staffRecordId: true },
    })
    await consumeTrialQuota(companyId, 'payslips', draftRecipients.map((p) => p.staffRecordId))

    const job = await createPendingPayslipBulkSend(companyId, month, yearNumber, user.userId, totalToSend)

    // Respond immediately; the actual send loop continues after the response
    // is sent. REL-001: it runs as a durable queued job when the job queue is
    // running; otherwise it runs in this process exactly as before.
    const queued = await enqueueJob(JOB_QUEUES.PAYSLIP_BULK_SEND, {
      jobId: job.id,
      companyId,
      month,
      year: yearNumber,
      userId: user.userId,
    })
    if (!queued) processBulkSendInBackground({
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
