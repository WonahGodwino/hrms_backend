// src/app/api/payroll/generate/[runId]/reopen/route.ts
//
// "Edit Payroll" for an already-approved run. Drops the run (and every one
// of its PayrollData rows) back from APPROVED to GENERATED so HR can use
// the normal row-edit/Recompute/Exclude/Include actions again — none of
// which touch a real Payroll/Payslip. The already-issued real records stay
// exactly as they are, untouched, for the entire editing session; the one
// deliberate point they get overwritten is when HR re-Approves
// (approveGenerationRun's upserts are idempotent — see
// finalize-generated-payroll.ts — so re-approving updates each real record
// in place rather than duplicating it, and retracts anyone excluded during
// this session).
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
    if (run.status !== 'APPROVED') {
      return withCors(ApiResponse.error('Only an already-approved run can be reopened for editing', 409), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    await prisma.$transaction([
      prisma.payrollData.updateMany({
        where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod, status: 'APPROVED' },
        data: { status: 'GENERATED' }
      }),
      prisma.payrollGenerationRun.update({ where: { id: run.id }, data: { status: 'GENERATED', triggeredBy: user.userId } })
    ])

    return withCors(
      ApiResponse.success(
        { runId: run.id, status: 'GENERATED' },
        'Reopened for editing — nothing changes for staff until you approve again'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
