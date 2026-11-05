// src/app/api/payroll/generate/[runId]/recompute/route.ts
//
// Re-runs field resolution for every staff member on an existing generation
// run, pulling current StaffPayrollProfile values, StaffRecord fields and
// template rules fresh. This is how HR picks up changes made in Staff
// Management or Staff Compensation *after* a run was already generated,
// without retyping them by hand via single-row or bulk edit, which can only
// change what's already on the draft, not pull in new source data.
//
// Deliberately reuses processPayrollGenerationInBackground as-is rather than
// duplicating its resolution logic — it already re-resolves every staff
// member from current source data and upserts their PayrollData row on every
// call (see generate-payroll.ts), which is exactly a recompute. The only
// thing this route adds on top is: skip the "already exists" conflict check
// POST /payroll/generate applies (this run is already known, recomputing it
// isn't a duplicate).
//
// This intentionally overwrites every row's data with a fresh resolution,
// including any manual per-row edits or bulk-edit re-uploads made since the
// last generation or recompute — that's the point: a single/bulk edit can't
// systematically re-pull updated source data the way this does.
//
// Blocked once APPROVED — an approved run's live payslips are never touched
// from here. HR must POST .../reopen first (drops the run back to
// GENERATED without touching any real Payroll/Payslip), recompute/edit
// freely, then re-Approve, which is the one deliberate point where every
// real payslip gets overwritten.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { processPayrollGenerationInBackground } from '@/app/lib/payroll/generation/generate-payroll'

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
      return withCors(ApiResponse.error('This run is already being processed. Please wait for it to finish.', 409), origin)
    }
    if (run.status === 'APPROVED') {
      return withCors(ApiResponse.error('This run has already been approved. Reopen it for editing first.', 409), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    await prisma.payrollGenerationRun.update({
      where: { id: run.id },
      data: { status: 'PROCESSING', triggeredBy: user.userId }
    })

    // Respond immediately; the per-staff resolution continues after the
    // response is sent, same async pattern as the initial Generate step.
    processPayrollGenerationInBackground(run.id).catch((err) => {
      console.error('[PAYROLL_GENERATION] Unhandled recompute error:', err)
    })

    return withCors(
      ApiResponse.success({ runId: run.id, status: 'PROCESSING' }, 'Recomputing payroll from the latest staff data'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
