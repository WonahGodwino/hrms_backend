// src/app/lib/offers/ad-hoc-helpers.ts
// Shared helpers for the ad-hoc / direct offer workflow
// (ad-hoc create -> dispatch -> execute).
import { fileTypeFromBuffer } from 'file-type'

// Human-readable workflow statuses surfaced to the frontend. These are richer
// than the OfferStatus enum (DRAFT/SENT/ACCEPTED/...), so we persist them in
// Offer.metadata.displayStatus and echo them back in API responses.
export const OFFER_DISPLAY_STATUS = {
  READY_TO_SEND: 'Ready to Send',
  AWAITING_SIGNATURE: 'Awaiting Signature',
  SENT_CLOSED: 'Sent/Closed',
  ACCEPTED: 'Accepted',
} as const

export type OfferMetadata = {
  isAdHoc?: boolean
  trackSignature?: boolean
  initiateOnboarding?: boolean
  displayStatus?: string
  dispatchMethod?: 'automated' | 'manual'
  dispatchedAt?: string
  offerFileId?: string
  executedFileId?: string
  executedDocument?: {
    fileName: string
    size: number
    uploadedAt: string
  }
  [key: string]: any
}

// Reads Offer.metadata defensively (it is stored as JSON).
export function readOfferMetadata(metadata: unknown): OfferMetadata {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as OfferMetadata
  }
  return {}
}

// Splits a display name into first/last; lastName falls back to '-' so the
// non-null StaffRecord/Candidate name columns are satisfied.
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = String(fullName || '').trim().split(/\s+/)
  const firstName = parts.shift() || String(fullName || '').trim()
  const lastName = parts.join(' ') || '-'
  return { firstName, lastName }
}

// Validates an uploaded PDF and returns its bytes. Returns { error } on failure.
export async function readPdfUpload(
  file: File | null,
  { maxBytes = 10 * 1024 * 1024 }: { maxBytes?: number } = {}
): Promise<{ buffer: Buffer; mime: string; size: number; name: string } | { error: string }> {
  if (!file) return { error: 'A PDF file is required' }
  if (file.size > maxBytes) {
    return { error: `File size exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit` }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const detected = await fileTypeFromBuffer(buffer)
  const extOk = file.name.split('.').pop()?.toLowerCase() === 'pdf'
  const mimeOk = detected?.mime === 'application/pdf'

  if (!mimeOk && !extOk) {
    return { error: 'Invalid file type. Only PDF files are accepted.' }
  }

  return {
    buffer,
    mime: detected?.mime || 'application/pdf',
    size: file.size,
    name: file.name,
  }
}

// Builds the absolute URL the frontend can use to download an offer document.
// kind 'offer' -> the drafted/dispatched letter; 'signed' -> the executed copy.
export function buildOfferDocumentUrl(
  requestUrl: string,
  offerId: string,
  kind: 'offer' | 'signed' = 'offer'
): string {
  const base = process.env.BACKEND_URL || new URL(requestUrl).origin
  return `${base.replace(/\/$/, '')}/api/offers/${offerId}/document?kind=${kind}`
}
