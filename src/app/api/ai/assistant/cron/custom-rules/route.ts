// [ai-assistant] Custom rule evaluator — POST runs every custom automation rule that is due.
// Schedule this hourly: hourly rules need it, and `event` rules are checked on every pass. Daily and weekly rules wait until their
// schedule has elapsed since their last run, so calling this more often than needed does no harm. The daily retention job runs the
// same evaluator, so a deployment that only schedules that one still evaluates daily and weekly rules.
// Auth: x-cron-secret header must match CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { handleApiError } from '@/app/lib/utils'
import { isPlatformEnabled } from '@/app/lib/ai/flags'
import { isCronAuthorized } from '@/app/lib/ai/cronAuth'
import { evaluateCustomRules } from '@/app/lib/core-setup/custom-rules'

export async function POST(request: NextRequest) {
  try {
    if (!isCronAuthorized(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isPlatformEnabled(prisma))) {
      return NextResponse.json({ success: true, skipped: 'AI Assistant is off' })
    }
    return NextResponse.json({ success: true, customRules: await evaluateCustomRules(prisma) })
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 })
  }
}