// src/app/api/webhooks/mailgun/route.ts
//
// POST — Mailgun delivery events (delivered / permanent failure / complaint).
// "SENT" in EmailLog only means Mailgun accepted the message; this webhook
// records what actually happened to it so the Payslip Email Delivery page can
// be trusted. Configure in Mailgun: Sending > Webhooks, URL
//   <BACKEND_URL>/api/webhooks/mailgun
// for the "Delivered", "Permanent failure" and "Spam complaints" events, and set
// MAILGUN_WEBHOOK_SIGNING_KEY to the account's HTTP webhook signing key.
//
// Public route (Mailgun cannot send a JWT); authenticated by HMAC signature.
// It fails closed: without a signing key nothing is accepted.
import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/app/lib/db'
import { interpretMailgunEvent, verifyMailgunSignature } from '@/app/lib/mailgun-webhook'
import { normalizeMessageId, PAYSLIP_EMAIL_TYPES } from '@/app/lib/payroll/email-log'
import { markPayslipEmailFailedByMessageId } from '@/app/lib/payroll/payslip-email-status'

const MATCH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY
  if (!signingKey) {
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 503 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (!verifyMailgunSignature(signingKey, body?.signature)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 })
  }

  const eventData = body?.['event-data']
  const outcome = interpretMailgunEvent(eventData)
  // Ignored events (accepted, opened, temporary failures...) are acknowledged so
  // Mailgun does not keep retrying them.
  if (!outcome) return NextResponse.json({ ok: true, ignored: true })

  const messageId = normalizeMessageId(eventData?.message?.headers?.['message-id'])
  const recipient = String(eventData?.recipient || '').trim()
  if (!messageId && !recipient) return NextResponse.json({ ok: true, ignored: true })

  try {
    // Recent attempts for this recipient (uses the createdAt index), then pick
    // the one carrying this exact message id; without an id match fall back to
    // the most recent attempt for that recipient.
    const candidates = await prisma.emailLog.findMany({
      where: {
        emailType: { in: PAYSLIP_EMAIL_TYPES },
        createdAt: { gte: new Date(Date.now() - MATCH_WINDOW_MS) },
        ...(recipient ? { recipient: { equals: recipient, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, status: true, metadata: true },
    })

    const log =
      candidates.find((c) => normalizeMessageId((c.metadata as any)?.messageId) === messageId && messageId) ||
      (messageId ? null : candidates[0])
    if (!log) return NextResponse.json({ ok: true, matched: false })

    const metadata = { ...((log.metadata as Record<string, unknown>) || {}), delivery: { event: outcome.event, at: new Date().toISOString() } }
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        metadata: metadata as any,
        // A bounce/complaint turns an accepted send into a failed one so the
        // delivery page and "undelivered" counts tell the truth.
        ...(outcome.failed ? { status: 'FAILED', error: outcome.reason } : {}),
      },
    })
    if (outcome.failed && messageId) await markPayslipEmailFailedByMessageId(messageId)
    return NextResponse.json({ ok: true, matched: true })
  } catch (error) {
    console.error('[MAILGUN_WEBHOOK] Failed to record event:', error)
    // 500 makes Mailgun retry, which is what we want for a transient DB error.
    return NextResponse.json({ ok: false, error: 'Failed to record event' }, { status: 500 })
  }
}
