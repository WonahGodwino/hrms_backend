// src/app/api/payroll/generate/[runId]/include/route.ts
//
// Undoes an exclusion — removes the given staff from run.excludedStaffIds
// and re-triggers the same background resolution recompute already uses
// (processPayrollGenerationInBackground), so the re-included staff get a
// fresh PayrollData row through the normal resolver path rather than this
// route trying to duplicate that logic for just one or two people.
//
// Blocked once APPROVED — an approved run's live payslips are never touched
// from here. HR must POST .../reopen first (drops the run back to
// GENERATED without touching any real Payroll/Payslip), re-include freely,
// then re-Approve, which is the one deliberate point where every real
// payslip gets overwritten (including a fresh one for anyone re-included).
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

    const toRemove = new Set(staffIds)
    const excludedStaffIds = run.excludedStaffIds.filter((id) => !toRemove.has(id))

    await prisma.payrollGenerationRun.update({
      where: { id: run.id },
      data: { status: 'PROCESSING', excludedStaffIds, triggeredBy: user.userId }
    })

    // Respond immediately; the re-included staff are resolved and written
    // after the response is sent, same async pattern as Generate/Recompute.
    processPayrollGenerationInBackground(run.id).catch((err) => {
      console.error('[PAYROLL_GENERATION] Unhandled re-include error:', err)
    })

    return withCors(
      ApiResponse.success({ runId: run.id, status: 'PROCESSING' }, 'Re-including staff and recomputing this pay period'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
