// Daily trial lifecycle sweep: reminder emails on day 35, 42 and 44 and the read-only notice.
// Auth: x-cron-secret header must match CRON_SECRET (same as the other cron routes).
import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/app/lib/utils'
import { isCronAuthorized } from '@/app/lib/ai/cronAuth'
import { runTrialLifecycle } from '@/app/lib/trial/lifecycle'

export async function POST(request: NextRequest) {
  try {
    if (!isCronAuthorized(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ success: true, ...(await runTrialLifecycle()) })
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 })
  }
}
