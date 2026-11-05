// src/app/api/payroll/generate/[runId]/exclude/route.ts
//
// Removes one or more staff members from an already-generated run (e.g. HR
// only realizes someone should be excluded after seeing the generated
// numbers on the review page) — the counterpart to the "Exclude Staff"
// picker on the initial Generate form, which only covers staff excluded
// before the first click. Deletes their PayrollData row immediately (so the
// review table reflects it without waiting for a Recompute) and records the
// exclusion on the run itself, so a later Recompute doesn't resurrect them
// (processPayrollGenerationInBackground filters by run.excludedStaffIds).
//
// Blocked once APPROVED — an approved run's live payslips are never touched
// from here. HR must POST .../reopen first (drops the run back to
// GENERATED without touching any real Payroll/Payslip); if that staff
// member already has a real payslip from before, excluding them while
// reopened only marks them excluded — their real Payroll/Payslip is deleted
// by approveGenerationRun at the point HR re-Approves, not before (see
// finalize-generated-payroll.ts), so nothing is retracted until that one
// deliberate step.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { runId: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const run = await prisma.payrollGenerationRun.findUnique({ where: { id: params.runId } })
    if (!run) {
      return withCors(ApiResponse.error('Generation run not found', 404), origin)
    }
    if (run.status === 'PROCESSING') {
      return withCors(ApiResponse.error('This run is still being processed. Please wait for it to finish.', 409), origin)
    }
    if (run.status === 'APPROVED') {
      return withCors(ApiResponse.error('This run has already been approved. Reopen it for editing first.', 409), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const body = await request.json().catch(() => ({}))
    const staffIds = body?.staffIds
    if (!Array.isArray(staffIds) || staffIds.length === 0 || staffIds.some((id) => typeof id !== 'string')) {
      return withCors(ApiResponse.error('staffIds must be a non-empty array of staff IDs', 400), origin)
    }

    const excludedStaffIds = Array.from(new Set([...run.excludedStaffIds, ...staffIds]))

    const { count } = await prisma.$transaction(async (tx) => {
      // Count first (not staffIds.length) — some ids may already have no row
      // (already excluded, or never generated in the first place).
      const result = await tx.payrollData.deleteMany({
        where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod, staffId: { in: staffIds } }
      })
      await tx.payrollGenerationRun.update({
        where: { id: run.id },
        // flaggedCount is left as-is here (a soft badge, not financial data)
        // — Recompute always fully recalculates it.
        data: { excludedStaffIds, totalStaff: { decrement: result.count } }
      })
      return result
    })

    return withCors(
      ApiResponse.success({ runId: run.id, excludedStaffIds, removedCount: count }, 'Staff excluded from this pay period'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
