// Trial lifecycle emails (document section 2): early warning on day 35 and day 42, a last-day
// note on day 44, and a read-only notice once the trial has ended. Nothing in the product
// changes at these points; the clock itself is derived in guard.ts. Meant to be called by a
// daily cron (POST /api/trial/cron). Each stage is sent once per company; the "sent" marker is
// a TrialUsageCounter row so no schema change is needed.
import { prisma } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/email'

import { READ_ONLY_DAYS } from './limits'
import { forCompany } from '@/app/lib/data/tenant'

const DAY_MS = 24 * 60 * 60 * 1000
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://247hr.co.uk'

export type LifecycleStage = 'day7' | 'day35' | 'day42' | 'day44' | 'readonly'
const ORDER: LifecycleStage[] = ['day35', 'day42', 'day44', 'readonly']

// Whole days left, rounded up, so the last day (any time before the end) is 1 and 0 means ended.
export function stageFor(trialEndsAt: Date, extraDays: number, now: Date): LifecycleStage | null {
  const end = trialEndsAt.getTime() + (extraDays || 0) * DAY_MS
  const left = Math.ceil((end - now.getTime()) / DAY_MS)
  if (left <= 0) return now.getTime() <= end + READ_ONLY_DAYS * DAY_MS ? 'readonly' : null
  if (left <= 1) return 'day44'
  if (left <= 2) return 'day42'
  if (left <= 9) return 'day35'
  return null
}

// Day 7 check-in (document section 5): a personal note offering a short walkthrough.
export function isCheckInDue(trialStartsAt: Date | null, now: Date): boolean {
  return !!trialStartsAt && now.getTime() - trialStartsAt.getTime() >= 7 * DAY_MS
}

function copy(stage: LifecycleStage, daysLeft: number): { subject: string; headline: string; body: string } {
  switch (stage) {
    case 'day7':
      return { subject: 'How is your 247HR trial going?', headline: 'A week in: how is it going?', body: 'If you would like a 20 minute walkthrough with someone from our team, just reply to this email and we will set one up.' }
    case 'day35':
      return { subject: `Your 247HR trial: ${daysLeft} days left`, headline: `${daysLeft} days left in your trial`, body: 'Nothing changes yet. When the trial ends your account becomes read only: you can still view everything, but nothing can be added, edited or sent.' }
    case 'day42':
      return { subject: 'Your 247HR trial ends in 2 days', headline: 'Your trial ends in 2 days', body: 'After it ends your data stays safe and visible, but you will not be able to change or send anything until you subscribe.' }
    case 'day44':
      return { subject: 'Your 247HR trial ends today', headline: 'Your trial ends today', body: 'Subscribe to keep adding, editing and sending. If you need a little more time, reply to this email and our team will help.' }
    default:
      return { subject: 'Your 247HR account is now read only', headline: 'Your account is read only', body: 'Everything you set up is still here to view. Subscribe to continue; your data is restored in full.' }
  }
}

async function alreadySent(companyId: string, stage: LifecycleStage): Promise<boolean> {
  return (await forCompany(companyId).trialUsageCounter.count({ where: { metric: 'trialReminder', subjectKey: stage } })) > 0
}

async function markSent(companyId: string, stages: LifecycleStage[]) {
  await prisma.trialUsageCounter.createMany({
    data: stages.map((subjectKey) => ({ companyId, metric: 'trialReminder', subjectKey })),
    skipDuplicates: true,
  })
}

export async function runTrialLifecycle(now = new Date()) {
  const companies = await prisma.company.findMany({
    where: { trialStatus: 'TRIAL', trialEndsAt: { not: null } },
    select: { id: true, companyName: true, trialStartsAt: true, trialEndsAt: true, trialExtraDays: true },
  })
  let sent = 0
  let skipped = 0
  for (const c of companies) {
    const stage = stageFor(c.trialEndsAt as Date, c.trialExtraDays, now) ?? (isCheckInDue(c.trialStartsAt, now) ? 'day7' : null)
    if (!stage || (await alreadySent(c.id, stage))) {
      skipped++
      continue
    }
    const hr = await prisma.staffRecord.findFirst({ where: { companyId: c.id, role: 'HR', isActive: true }, select: { email: true, firstName: true } })
    if (!hr?.email) {
      skipped++
      continue
    }
    const [staff, payslips] = await Promise.all([
      prisma.staffRecord.count({ where: { companyId: c.id } }),
      prisma.trialUsageCounter.count({ where: { companyId: c.id, metric: 'payslips' } }),
    ])
    const end = (c.trialEndsAt as Date).getTime() + (c.trialExtraDays || 0) * DAY_MS
    const { subject, headline, body } = copy(stage, Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS)))
    const summary = `So far in ${c.companyName}: ${staff} staff record${staff === 1 ? '' : 's'} added and ${payslips} payslip${payslips === 1 ? '' : 's'} sent.`
    const res = await sendEmail({
      to: hr.email,
      subject,
      text: `Hi ${hr.firstName ?? ''},\n\n${headline}.\n\n${body}\n\n${summary}\n\n${FRONTEND_URL}`,
      html: `<p>Hi ${hr.firstName ?? ''},</p><h3>${headline}</h3><p>${body}</p><p>${summary}</p><p><a href="${FRONTEND_URL}">Open 247HR</a></p>`,
    })
    if (res.success) {
      // Mark this stage and any earlier one, so a late cron never sends a stale warning afterwards.
      await markSent(c.id, stage === 'day7' ? ['day7'] : ORDER.slice(0, ORDER.indexOf(stage) + 1))
      sent++
    } else {
      skipped++
    }
  }
  return { checked: companies.length, sent, skipped }
}
