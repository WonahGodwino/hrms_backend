// src/app/api/core-setup/automation/cron/route.ts
//
// POST /api/core-setup/automation/cron[?companyId=...&force=true]
//
// The server-side scheduler tick (PRD 4.4). Point an external scheduler (cron-job.org, a Render cron job, ...) at it every 5 to 15
// minutes. Each tick runs only what is due: a rule whose hourly, daily or weekly cadence has elapsed, and a rule that reacts to changes
// when a record it watches changed since it last ran. Calling it more often than needed is harmless.
//
// Two ways to authenticate (same convention as /api/recruitment/offers/expire-lapsed):
//  1. The scheduler: header `x-cron-secret: <process.env.CRON_SECRET>`. Runs every active company.
//  2. A SUPER_ADMIN user (Bearer token): runs all companies, or one with ?companyId=...; ?force=true ignores the schedule.
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { runAutomationForAllCompanies, runAutomationForCompany } from '@/app/lib/core-setup/automation-engine'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const cronSecret = process.env.CRON_SECRET
    const provided = request.headers.get('x-cron-secret')
    const isCron = !!cronSecret && provided === cronSecret

    const params = new URL(request.url).searchParams
    let companyId: string | null = null
    let force = false
    if (!isCron) {
      const authHeader = request.headers.get('authorization')
      if (!authHeader) {
        return withCors(ApiResponse.error('Authorization header missing', 401), origin)
      }
      requireRole(authHeader.replace('Bearer ', ''), ['SUPER_ADMIN'])
      companyId = params.get('companyId')
      force = params.get('force') === 'true'
    }

    const summaries = companyId
      ? [await runAutomationForCompany(companyId, { force })]
      : await runAutomationForAllCompanies({ force })

    const ran = summaries.reduce((n, s) => n + s.ran.length, 0)
    const failed = summaries.reduce((n, s) => n + s.failed.length, 0)
    return withCors(
      ApiResponse.success({ companies: summaries.length, checksRun: ran, checksFailed: failed, summaries }, `${ran} check${ran === 1 ? '' : 's'} run`),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
