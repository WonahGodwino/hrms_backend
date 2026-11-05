// src/app/api/payroll/generate/route.ts
//
// "Generate" step of the Payroll Generation sub-module. Responds as soon as
// the run row exists (fast) and continues the actual per-staff resolution
// in the background after the response is sent — same async pattern as the
// existing manual payroll upload and staff bulk-edit upload endpoints. The
// review page (GET /payroll/generate/[runId]) is the polling target: while
// the run's status is PROCESSING it just returns whatever partial rows
// exist so far (or none yet), with no errors.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { consumeTrialQuota } from '@/app/lib/trial/guard'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { startPayrollGeneration, processPayrollGenerationInBackground } from '@/app/lib/payroll/generation/generate-payroll'
import { findCompanyDisabledCodesInUse } from '@/app/lib/staff/pension-fields'

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
    const { companyId, templateId, month, year, workingDaysInAMonth, excludedStaffIds } = body as {
      companyId?: string
      templateId?: string
      month?: string
      year?: number
      workingDaysInAMonth?: number
      excludedStaffIds?: unknown
    }

    if (!companyId || !templateId || !month || !year) {
      return withCors(ApiResponse.error('companyId, templateId, month and year are all required', 400), origin)
    }

    // Free trial: one payroll period; regenerating the same period is free.
    await consumeTrialQuota(companyId, 'payrollRuns', [`${year}-${month}`])

    // Fixed, always-required going forward — attendance-based gross
    // proration in field-resolver.ts needs something to divide by. Not
    // optional per-template the way GROSS_SYSTEM_FIELD is.
    const workingDaysInAMonthNum = Number(workingDaysInAMonth)
    if (!Number.isFinite(workingDaysInAMonthNum) || workingDaysInAMonthNum < 15) {
      return withCors(ApiResponse.error('workingDaysInAMonth is required and must be at least 15 days', 400), origin)
    }

    if (excludedStaffIds !== undefined && (!Array.isArray(excludedStaffIds) || excludedStaffIds.some((id) => typeof id !== 'string'))) {
      return withCors(ApiResponse.error('excludedStaffIds must be an array of staff IDs', 400), origin)
    }
    const excludedStaffIdsList = Array.isArray(excludedStaffIds) ? (excludedStaffIds as string[]) : []

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    // Check for duplicate: same company + template + month + year. A
    // different template for the same month is fine (scoped by templateId
    // below), only the exact (template, month) combination is blocked. A
    // FAILED run doesn't count as "existing", it never produced usable
    // draft data, so retrying immediately is expected, not a duplicate.
    const payPeriod = `${month} ${year}`
    const existingRun = await prisma.payrollGenerationRun.findFirst({
      where: {
        companyId,
        templateId,
        payPeriod,
        status: { not: 'FAILED' }
      },
      include: { template: { select: { templateName: true } } }
    })

    if (existingRun) {
      return withCors(
        ApiResponse.error(
          `A payroll for ${payPeriod} using "${existingRun.template.templateName}" already exists (status: ${existingRun.status}). You cannot generate a duplicate payroll for the same month and template, view or delete the existing one first.`,
          409,
          undefined,
          {
            existingRun: {
              id: existingRun.id,
              status: existingRun.status,
              payPeriod: existingRun.payPeriod,
              templateName: existingRun.template.templateName,
              approvedAt: existingRun.approvedAt,
              createdAt: existingRun.createdAt
            }
          }
        ),
        origin
      )
    }

    // Block company-wide if any active staff member currently holds a PFA
    // code this company has since disabled — the UI already disables the
    // Generate button for this, this is the server-side mirror so a direct
    // API call can't bypass it (pension-compliance-affecting, so enforced on
    // both sides, unlike the UI-only conflict check above).
    const disabledPfaGroups = await findCompanyDisabledCodesInUse(companyId)
    if (disabledPfaGroups.length > 0) {
      const affected = disabledPfaGroups.flatMap((g) => g.staff)
      return withCors(
        ApiResponse.error(
          `${affected.length} staff member${affected.length === 1 ? '' : 's'} currently use a PFA code this company has disabled. Update their PFA code before generating payroll.`,
          409,
          undefined,
          { disabledPfaInUse: affected }
        ),
        origin
      )
    }

    const result = await startPayrollGeneration({
      companyId,
      templateId,
      month,
      year: Number(year),
      triggeredBy: user.userId,
      workingDaysInAMonth: workingDaysInAMonthNum,
      excludedStaffIds: excludedStaffIdsList
    })

    // Respond immediately; the per-staff resolution continues after the
    // response is sent. This process is a long-running Node server (not a
    // serverless function), so the event loop keeps running this work after
    // the request completes.
    processPayrollGenerationInBackground(result.runId).catch((err) => {
      console.error('[PAYROLL_GENERATION] Unhandled background processing error:', err)
    })

    return withCors(
      ApiResponse.success({ ...result, status: 'PROCESSING' }, `Payroll generation started for ${result.payPeriod}`),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
