// Files a new hire uploads during pre-offer onboarding (recruitment), defined as checklist tasks.
//
// No extra tables: a template task (and the onboarding task copied from it) is a "document upload" when its
// category is `DOCUMENT:<KEY>` (copied to OnboardingTask.department), and it is done by the new hire when its
// assignee is "Candidate". The upload is a CandidateDocument with `category = KEY`; HR approving it ticks the task.
import type { Prisma } from '@prisma/client'

export const DOCUMENT_CATEGORY_PREFIX = 'DOCUMENT:'
/** Assignee label for tasks the new hire completes themselves (matched case-insensitively). */
export const CANDIDATE_ASSIGNEE = 'Candidate'
/** Section name the checklist shows document tasks under. */
export const DOCUMENTS_SECTION = 'Documents'

export type DocumentAccept = 'pdf' | 'pdf-or-image' | 'image'

export interface OnboardingDocSpec {
  key: string
  label: string
  /** CandidateDocument.type column. */
  type: 'ID_CARD' | 'CERTIFICATE' | 'OTHER'
  accept: DocumentAccept
  hint?: string
}

export const ONBOARDING_DOC_PRESETS: readonly OnboardingDocSpec[] = [
  { key: 'MEANS_OF_ID', label: 'Means of identification', type: 'ID_CARD', accept: 'pdf-or-image', hint: "Passport, driver's licence or national ID." },
  { key: 'GUARANTOR_FORM', label: 'Guarantor form', type: 'OTHER', accept: 'pdf-or-image', hint: 'Completed and signed guarantor form.' },
  { key: 'PASSPORT_PHOTO', label: 'Passport photograph', type: 'OTHER', accept: 'image', hint: 'A recent passport-style photo (JPG or PNG).' },
  { key: 'EDUCATIONAL_CERTIFICATE', label: 'Educational certificates', type: 'CERTIFICATE', accept: 'pdf-or-image', hint: 'Your highest qualification certificate.' },
  { key: 'PROOF_OF_ADDRESS', label: 'Proof of address', type: 'OTHER', accept: 'pdf-or-image', hint: 'A recent utility bill or bank statement.' },
]

/** A plain date field the new hire fills in directly (no file), such as date of birth. */
export const DATE_FIELD_CATEGORY_PREFIX = 'DATE_FIELD:'

export interface OnboardingDateFieldSpec {
  key: string
  label: string
  hint?: string
}

export const ONBOARDING_DATE_FIELD_PRESETS: readonly OnboardingDateFieldSpec[] = [
  { key: 'DATE_OF_BIRTH', label: 'Date of birth', hint: 'Enter your date of birth exactly as it appears on your official documents.' },
]

export function dateFieldCategory(key: string): string {
  return `${DATE_FIELD_CATEGORY_PREFIX}${key}`
}

/** The date-field key in a task category such as `DATE_FIELD:DATE_OF_BIRTH`, or null for any other task. */
export function dateFieldKeyOf(category: string | null | undefined): string | null {
  if (!category || !category.startsWith(DATE_FIELD_CATEGORY_PREFIX)) return null
  const key = category.slice(DATE_FIELD_CATEGORY_PREFIX.length).trim()
  return KEY_RE.test(key) ? key : null
}

export function dateFieldSpecFor(key: string, title?: string | null): OnboardingDateFieldSpec {
  return ONBOARDING_DATE_FIELD_PRESETS.find((p) => p.key === key) ?? { key, label: String(title || key) }
}

const KEY_RE = /^[A-Z0-9_]{2,60}$/

/** A stable document key from a free-text name: "NYSC certificate" -> "NYSC_CERTIFICATE". */
export function documentKeyFromName(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

export function documentCategory(key: string): string {
  return `${DOCUMENT_CATEGORY_PREFIX}${key}`
}

/** The document key in a task category such as `DOCUMENT:BIRTH_CERTIFICATE`, or null for a normal task. */
export function documentKeyOf(category: string | null | undefined): string | null {
  if (!category || !category.startsWith(DOCUMENT_CATEGORY_PREFIX)) return null
  const key = category.slice(DOCUMENT_CATEGORY_PREFIX.length).trim()
  return KEY_RE.test(key) ? key : null
}

export function isCandidateAssignee(assignee: string | null | undefined): boolean {
  return String(assignee || '').trim().toLowerCase() === CANDIDATE_ASSIGNEE.toLowerCase()
}

/** The preset for a key, or a custom spec named after the task title. */
export function docSpecFor(key: string, title?: string | null): OnboardingDocSpec {
  return ONBOARDING_DOC_PRESETS.find((p) => p.key === key) ?? { key, label: String(title || key), type: 'OTHER', accept: 'pdf-or-image' }
}

export interface TaskKind {
  kind: 'document' | 'date' | 'checklist'
  documentKey: string | null
  dateFieldKey: string | null
  /** True when the new hire completes the task (document and date-field tasks always are). */
  byCandidate: boolean
}

export function taskKindOf(task: { department?: string | null; assigneeId?: string | null }): TaskKind {
  const documentKey = documentKeyOf(task.department)
  const dateFieldKey = documentKey ? null : dateFieldKeyOf(task.department)
  const kind = documentKey ? 'document' : dateFieldKey ? 'date' : 'checklist'
  return { kind, documentKey, dateFieldKey, byCandidate: Boolean(documentKey || dateFieldKey) || isCandidateAssignee(task.assigneeId) }
}

/**
 * Checks and normalises a template task's category and assignee. A document task needs a valid key and is
 * always assigned to the new hire. Returns an error message for an invalid document category.
 */
export function normalizeTemplateTaskFields(category: unknown, assignee: unknown): { category: string | null; assignee: string | null } | { error: string } {
  const cat = typeof category === 'string' && category.trim() ? category.trim() : null
  const who = typeof assignee === 'string' && assignee.trim() ? assignee.trim() : null
  if (cat && cat.toUpperCase().startsWith(DOCUMENT_CATEGORY_PREFIX)) {
    const key = documentKeyOf(DOCUMENT_CATEGORY_PREFIX + cat.slice(DOCUMENT_CATEGORY_PREFIX.length).trim().toUpperCase())
    if (!key) return { error: 'Document tasks need a document name of letters, numbers and underscores.' }
    return { category: documentCategory(key), assignee: CANDIDATE_ASSIGNEE }
  }
  if (cat && cat.toUpperCase().startsWith(DATE_FIELD_CATEGORY_PREFIX)) {
    const key = dateFieldKeyOf(DATE_FIELD_CATEGORY_PREFIX + cat.slice(DATE_FIELD_CATEGORY_PREFIX.length).trim().toUpperCase())
    if (!key) return { error: 'Date field tasks need a field name of letters, numbers and underscores.' }
    return { category: dateFieldCategory(key), assignee: CANDIDATE_ASSIGNEE }
  }
  return { category: cat, assignee: who }
}

/** Mime types each accept rule allows, for detectFileType (lib/storage/private-files.ts). */
export function allowedTypesFor(accept: DocumentAccept): Record<string, string> {
  const images = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }
  if (accept === 'pdf') return { 'application/pdf': 'pdf' }
  if (accept === 'image') return images
  return { 'application/pdf': 'pdf', ...images }
}

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE'

/** Moves the document task(s) for `key` on an onboarding to `status` (upload, approve, reject keep it in step). */
export async function setDocumentTaskStatus(
  tx: Prisma.TransactionClient,
  onboardingId: string,
  key: string,
  status: TaskStatus,
): Promise<number> {
  const result = await tx.onboardingTask.updateMany({
    where: { onboardingId, archived: 0, department: documentCategory(key) },
    data: { status, completedAt: status === 'DONE' ? new Date() : null },
  })
  return result.count
}

/**
 * Records HR's review of an uploaded onboarding document and keeps its checklist task in step:
 * approved ticks the task, rejected sends it back to the new hire.
 */
export async function applyDocumentReview(
  tx: Prisma.TransactionClient,
  doc: { id: string; onboardingId: string | null; category: string | null },
  review: { status: 'APPROVED' | 'REJECTED'; reviewedBy: string; reason?: string | null },
): Promise<Date> {
  const now = new Date()
  await tx.candidateDocument.update({
    where: { id: doc.id },
    data: { reviewStatus: review.status, reviewedBy: review.reviewedBy, reviewedAt: now, rejectionReason: review.status === 'REJECTED' ? review.reason ?? null : null },
  })
  if (doc.onboardingId && doc.category) {
    await setDocumentTaskStatus(tx, doc.onboardingId, doc.category, review.status === 'APPROVED' ? 'DONE' : 'PENDING')
  }
  return now
}
