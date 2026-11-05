// GET /api/trial/status
//
// Two callers:
//  1. The edge middleware's read-only guard (header x-trial-internal = JWT_SECRET,
//     ?companyId=...) — it cannot reach the database itself.
//  2. The signed-in app (Bearer token) — returns the trial state and quota usage
//     for the countdown banner and "4 of 6 sent" counters.
import { NextRequest } from 'next/server'
import { requireAuth } from '@/app/lib/auth'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getTrialState, getTrialUsage } from '@/app/lib/trial/guard'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const { searchParams } = new URL(req.url)
    const internal = req.headers.get('x-trial-internal')

    if (internal && process.env.JWT_SECRET && internal === process.env.JWT_SECRET) {
      const state = await getTrialState(searchParams.get('companyId'))
      return withCors(ApiResponse.success({ status: state.status, readOnly: state.readOnly, restricted: state.restricted }), origin)
    }

    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireAuth(token)
    const requested = searchParams.get('companyId')
    const companyId = user.role === 'SUPER_ADMIN' ? requested || user.companyId : user.companyId

    const state = await getTrialState(companyId)
    if (!state.restricted || !companyId) {
      return withCors(ApiResponse.success({ restricted: false, status: state.status }), origin)
    }

    const [staffLive, staffCounted, payslips, offerLetters, payrollRuns] = await Promise.all([
      prisma.staffRecord.count({ where: { companyId } }),
      getTrialUsage(companyId, 'staff'),
      getTrialUsage(companyId, 'payslips'),
      getTrialUsage(companyId, 'offerLetters'),
      getTrialUsage(companyId, 'payrollRuns'),
    ])

    return withCors(
      ApiResponse.success({
        restricted: true,
        status: state.status,
        readOnly: state.readOnly,
        daysLeft: state.daysLeft,
        trialEndsAt: state.trialEndsAt,
        limits: state.limits,
        usage: {
          staff: Math.max(staffLive, staffCounted),
          payslips,
          offerLetters,
          payrollRuns,
        },
      }),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
