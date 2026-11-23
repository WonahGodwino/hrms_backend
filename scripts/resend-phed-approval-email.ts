// READ-ONLY PHED approval email resender.
//
// Re-sends the payroll-approval notification email for a memo's CURRENT desk,
// without touching the database. It performs SELECT queries only — it does NOT
// create in-app notifications, does NOT update the memo/period, and does NOT
// change any role assignment.
//
// Default is DRY-RUN (lists recipients only). Pass --send to actually send.
//
// Usage:
//   npx tsx scripts/resend-phed-approval-email.ts <memoId>
//   npx tsx scripts/resend-phed-approval-email.ts <memoId> --send
//
// Env required: DATABASE_URL, MAILGUN_API_KEY, MAILGUN_DOMAIN, FROM_EMAIL
// (same values the running backend uses).

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient, PhedAccessRole } from '@prisma/client'
import { sendPhedApprovalNotificationEmail } from '../src/app/lib/phed/email'
import { getStageDef } from '../src/app/lib/phed/approval-stages'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

async function main() {
  const args = process.argv.slice(2)
  const memoId = args.find((a) => !a.startsWith('--'))
  const shouldSend = args.includes('--send')

  if (!memoId) {
    console.error('Usage: npx tsx scripts/resend-phed-approval-email.ts <memoId> [--send]')
    process.exit(1)
  }

  const memo = await prisma.phedApprovalMemo.findUnique({
    where: { id: memoId },
    include: { payPeriod: { select: { periodName: true } } },
  })
  if (!memo) {
    console.error(`Memo not found: ${memoId}`)
    process.exit(1)
  }

  const company = await prisma.company.findUnique({
    where: { id: memo.companyId },
    select: { companyName: true },
  })

  const periodName = memo.payPeriod.periodName
  const companyName = company?.companyName ?? ''
  const deepLink = `${FRONTEND_URL}/phed/approvals/memos/${memo.id}`
  const isResubmission = memo.attemptNumber > 1

  // Same target-desk + wording rules as notifyAfterForward.
  let accessRole: PhedAccessRole
  let subjectLine: string
  let heading: string
  let bodyText: string
  let tone: 'info' | 'warning'

  if (memo.status === 'APPROVED') {
    accessRole = 'TREASURY_TEAM'
    subjectLine = 'Approval memo finalised — period approval still required'
    heading = 'Approval memo finalised — period approval pending'
    bodyText =
      'The Payroll Approval Memo has completed the full five-stage review and received final approval. The Bank Schedule is now available to Treasury. An HR/Admin user must still approve the pay period itself to unlock payslip emails and move it to Paid.'
    tone = 'info'
  } else {
    const next = getStageDef(memo.currentStage)
    if (!next) {
      console.error(`Unknown current stage: ${memo.currentStage}`)
      process.exit(1)
    }
    accessRole = next.role
    subjectLine = isResubmission
      ? 'A corrected payroll memo has been re-submitted for your approval'
      : 'A payroll approval memo awaits your review'
    heading = isResubmission
      ? 'Re-submission — please review and approve again'
      : 'A payroll approval memo is awaiting your review'
    bodyText = isResubmission
      ? 'The Payroll Approval Memo has been re-submitted after corrections were made. Please review the updated figures and approve again to continue the approval cycle.'
      : `This Payroll Approval Memo has been forwarded to your desk (${next.label}). Please review and take action.`
    tone = isResubmission ? 'warning' : 'info'
  }

  const holders = await prisma.phedStaffAccessRole.findMany({
    where: { companyId: memo.companyId, accessRole },
    include: { staffRecord: { select: { id: true, email: true, firstName: true, lastName: true } } },
  })

  console.log('\n=== PHED approval email resender ===')
  console.log(`Memo:      ${memo.id}`)
  console.log(`Period:    ${periodName}`)
  console.log(`Status:    ${memo.status} (stage ${memo.currentStage}, attempt ${memo.attemptNumber})`)
  console.log(`Target:    ${accessRole} — ${holders.length} holder(s)`)
  console.log(`Mode:      ${shouldSend ? 'SEND' : 'DRY-RUN (no emails sent)'}`)
  console.log('')

  if (holders.length === 0) {
    console.warn(`No holders found for ${accessRole} in company ${memo.companyId}.`)
  }

  for (const { staffRecord: staff } of holders) {
    const name = `${staff.firstName} ${staff.lastName}`.trim() || staff.email || staff.id
    if (!staff.email) {
      console.warn(`SKIP       ${name} — no email address on record`)
      continue
    }
    console.log(`${shouldSend ? 'SEND       ' : 'WOULD SEND '} ${name} <${staff.email}>`)
    console.log(`           "${heading}"`)

    if (shouldSend) {
      const res = await sendPhedApprovalNotificationEmail({
        to: staff.email,
        recipientName: name,
        companyName,
        periodName,
        subjectLine,
        heading,
        bodyText,
        deepLink,
        tone,
      })
      console.log(`           ${res.success ? '✓ sent' : '✗ FAILED: ' + (res.error || 'unknown error')}`)
    }
  }

  console.log('')
  console.log('No database records were created or modified by this script.')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
