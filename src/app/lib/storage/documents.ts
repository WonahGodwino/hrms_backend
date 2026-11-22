// ============================================================
// Document object storage (S3) — Phase C (offer letters, CVs,
// candidate-portal documents). Each model carries a nullable
// `s3Key` column; the DB Bytes column is kept as the fallback
// until a separately-approved cleanup nulls it.
//
// Reads are proxied through the backend; the DB blob is only a
// fallback for rows written before migration / when S3 is off.
// ============================================================

import { isS3Configured, putS3Object, getS3Object } from './s3'

export function offerLetterTemplateKey(companyId: string, id: string): string {
  return `offer-letter-templates/${companyId}/${id}.docx`
}

export function generatedOfferLetterKey(companyId: string, id: string): string {
  return `offer-letters/${companyId}/${id}.docx`
}

export function offerLetterEmailAttachmentKey(id: string): string {
  return `offer-letter-email-attachments/${id}`
}

export function offerLetterMailboxAttachmentKey(id: string): string {
  return `offer-letter-mailbox-attachments/${id}`
}

export function candidateFileKey(companyId: string, id: string): string {
  return `candidate-files/${companyId}/${id}`
}

export function candidateAccountDocumentKey(documentId: string): string {
  return `candidate-account-documents/${documentId}`
}

export function staffOnboardingDocumentKey(companyId: string, id: string): string {
  return `staff-onboarding-documents/${companyId}/${id}`
}

export function screeningCvResultKey(companyId: string, id: string): string {
  return `screening-cv-results/${companyId}/${id}`
}

export function leaveAttachmentKey(companyId: string, id: string): string {
  return `leave-attachments/${companyId}/${id}`
}

/**
 * Best-effort, non-blocking upload. Returns the key on success (and calls
 * `setKey` to record it), or null when storage is off / bytes are empty.
 * Callers must never let a failure break the DB write.
 */
export async function uploadDocumentObject(
  key: string,
  bytes: Uint8Array | Buffer | null | undefined,
  setKey: (key: string) => Promise<unknown>,
  contentType?: string,
): Promise<string | null> {
  if (!isS3Configured() || !bytes) return null
  const b = new Uint8Array(bytes)
  if (b.length === 0) return null
  await putS3Object(key, b, contentType)
  await setKey(key).catch(() => {})
  return key
}

/** Object bytes or null (caller falls back to the DB blob). */
export async function readDocumentObject(key: string | null | undefined): Promise<Uint8Array<ArrayBuffer> | null> {
  return key ? getS3Object(key) : null
}
