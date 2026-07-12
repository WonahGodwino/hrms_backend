// The offer response window: a candidate must accept AND return their signed
// letter within this many days of the letter being sent. After that the offer is
// treated as expired (HR/ADMIN may withdraw it and extend to another candidate).
export const OFFER_RESPONSE_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

// Resolve the response deadline: an explicit metadata.responseDeadline if set,
// otherwise sentAt + OFFER_RESPONSE_DAYS.
export function getResponseDeadline(offer: any): Date | null {
  const meta = offer?.metadata && typeof offer.metadata === 'object' ? offer.metadata : {}
  if (meta.responseDeadline) {
    const d = new Date(meta.responseDeadline)
    if (!isNaN(d.getTime())) return d
  }
  if (offer?.sentAt) {
    return new Date(new Date(offer.sentAt).getTime() + OFFER_RESPONSE_DAYS * DAY_MS)
  }
  return null
}

// Expired = past the deadline and NOT already resolved. A declined offer is a
// final decision (not "expired"); an accepted offer with the signed letter on
// file is complete (not "expired").
export function isResponseExpired(
  offer: any,
  deadline: Date | null = getResponseDeadline(offer)
): boolean {
  if (!deadline) return false
  if (offer?.status === 'DECLINED') return false
  if (offer?.status === 'ACCEPTED' && offer?.executedPdfPath) return false
  return Date.now() > deadline.getTime()
}
