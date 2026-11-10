// src/app/lib/mailgun-webhook.ts
//
// Pure helpers for Mailgun delivery webhooks (no DB, no network) so they are
// unit-testable. The route (api/webhooks/mailgun) wires them to EmailLog.
import { createHmac, timingSafeEqual } from 'crypto'

const MAX_SIGNATURE_AGE_SECONDS = 15 * 60

/**
 * Mailgun signs each webhook as HMAC-SHA256(signingKey, timestamp + token).
 * Rejects stale timestamps so a captured request cannot be replayed later.
 */
export function verifyMailgunSignature(
  signingKey: string | undefined,
  signature: { timestamp?: string; token?: string; signature?: string } | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!signingKey || !signature?.timestamp || !signature.token || !signature.signature) return false

  const ageSeconds = Math.abs(nowMs / 1000 - Number(signature.timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_SIGNATURE_AGE_SECONDS) return false

  const expected = createHmac('sha256', signingKey).update(signature.timestamp + signature.token).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature.signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type DeliveryOutcome = {
  /** What to record on the log's metadata.delivery. */
  event: 'delivered' | 'failed' | 'complained' | 'unsubscribed'
  /** True when the email did NOT reach the recipient and the log should read FAILED. */
  failed: boolean
  reason: string | null
}

/**
 * Maps a Mailgun event to a delivery outcome, or null for events we ignore
 * (accepted, opened, clicked, temporary failures that Mailgun will retry).
 */
export function interpretMailgunEvent(eventData: any): DeliveryOutcome | null {
  const event = String(eventData?.event || '').toLowerCase()
  const status = eventData?.['delivery-status']
  const reason = (status?.description || status?.message || eventData?.reason || '') || null

  if (event === 'delivered') return { event: 'delivered', failed: false, reason: null }
  if (event === 'failed') {
    // Temporary failures are retried by Mailgun; only a permanent failure is final.
    if (String(eventData?.severity || '').toLowerCase() !== 'permanent') return null
    return { event: 'failed', failed: true, reason: reason || 'Permanent delivery failure (bounced)' }
  }
  if (event === 'complained') return { event: 'complained', failed: true, reason: 'Recipient marked the email as spam' }
  if (event === 'unsubscribed') return { event: 'unsubscribed', failed: false, reason: null }
  return null
}
