// The new hire's view of their pre-offer onboarding checklist, and the changes they are allowed to make.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { dateFieldSpecFor, docSpecFor, setDocumentTaskStatus, taskKindOf, type DocumentAccept } from '@/app/lib/recruitment/onboarding-documents'
import { PublicOnboardingError } from '@/app/lib/onboarding/public-access'

export interface PublicChecklistDocument {
  fileName: string
  reviewStatus: string
  rejectionReason: string | null
  uploadedAt: string
}

export interface PublicChecklistTask {
  id: string
  title: string
  description: string
  kind: 'document' | 'date' | 'checklist'
  /** 'you' = the new hire completes it; 'company' = HR, IT or a manager does. */
  doneBy: 'you' | 'company'
  status: string
  completed: boolean
  dueDate: string | null
  document: null | {
    key: string
    label: string
    accept: DocumentAccept
    hint: string | null
    upload: PublicChecklistDocument | null
  }
  dateField: null | {
    key: string
    label: string
    hint: string | null
    value: string | null
  }
}

/** Every task on the onboarding, with the new hire's latest upload for each document task. */
export async function buildPublicChecklist(onboardingId: string): Promise<PublicChecklistTask[]> {
  const [onboarding, tasks, docs] = await Promise.all([
    prisma.onboarding.findUnique({ where: { id: onboardingId }, select: { metadata: true } }),
    prisma.onboardingTask.findMany({
      where: { onboardingId, archived: 0 },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, description: true, department: true, assigneeId: true, status: true, dueDate: true },
    }),
    prisma.candidateDocument.findMany({
      where: { onboardingId, archived: 0 },
      orderBy: { updatedAt: 'desc' },
      select: { category: true, fileName: true, reviewStatus: true, rejectionReason: true, updatedAt: true },
    }),
  ])
  const latest = new Map<string, (typeof docs)[number]>()
  for (const d of docs) if (d.category && !latest.has(d.category)) latest.set(d.category, d)
  const metadata = onboarding?.metadata && typeof onboarding.metadata === 'object' && !Array.isArray(onboarding.metadata) ? (onboarding.metadata as Record<string, unknown>) : {}

  return tasks.map((t) => {
    const kind = taskKindOf(t)
    const spec = kind.documentKey ? docSpecFor(kind.documentKey, t.title) : null
    const dateSpec = kind.dateFieldKey ? dateFieldSpecFor(kind.dateFieldKey, t.title) : null
    const upload = kind.documentKey ? latest.get(kind.documentKey) : undefined
    return {
      id: t.id,
      title: t.title,
      description: t.description || '',
      kind: kind.kind,
      doneBy: kind.byCandidate ? 'you' : 'company',
      status: t.status,
      completed: t.status === 'DONE',
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      document: spec
        ? {
            key: spec.key,
            label: spec.label,
            accept: spec.accept,
            hint: spec.hint ?? null,
            upload: upload
              ? {
                  fileName: upload.fileName,
                  reviewStatus: upload.reviewStatus || 'PENDING',
                  rejectionReason: upload.rejectionReason,
                  uploadedAt: upload.updatedAt.toISOString(),
                }
              : null,
          }
        : null,
      dateField: dateSpec
        ? {
            key: dateSpec.key,
            label: dateSpec.label,
            hint: dateSpec.hint ?? null,
            value: typeof metadata.dateOfBirth === 'string' ? metadata.dateOfBirth : null,
          }
        : null,
    }
  })
}

/** The task, checked to belong to this onboarding. */
export async function loadOwnTask(onboardingId: string, taskId: string) {
  const task = await prisma.onboardingTask.findFirst({
    where: { id: taskId, onboardingId, archived: 0 },
    select: { id: true, title: true, department: true, assigneeId: true, status: true },
  })
  if (!task) throw new PublicOnboardingError('Task not found.', 404)
  return task
}

/** The new hire ticks or unticks one of their own checklist items (not documents, which HR approves). */
export async function toggleCandidateTask(onboardingId: string, taskId: string, completed: boolean): Promise<void> {
  const task = await loadOwnTask(onboardingId, taskId)
  const kind = taskKindOf(task)
  if (kind.kind === 'document') throw new PublicOnboardingError('Upload the file instead; HR marks it done after review.', 409)
  if (!kind.byCandidate) throw new PublicOnboardingError('This task is completed by the company.', 403)
  await prisma.onboardingTask.update({
    where: { id: task.id },
    data: { status: completed ? 'DONE' : 'PENDING', completedAt: completed ? new Date() : null },
  })
}

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/

/** A plausible date of birth (YYYY-MM-DD, aged 16 to 100 today — the minimum working age), or null. */
export function parseDateOfBirth(raw: unknown, today: Date = new Date()): string | null {
  const s = String(raw ?? '').trim()
  if (!DOB_RE.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null
  const age = (today.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
  return age >= 16 && age <= 100 ? s : null
}

/**
 * Records the new hire's upload for a document task: one current file per document (a re-upload replaces it
 * unless HR already approved it), the task moves to IN_PROGRESS for HR review.
 */
export async function recordCandidateUpload(input: {
  onboardingId: string
  companyId: string
  candidateId: string
  documentKey: string
  type: 'ID_CARD' | 'CERTIFICATE' | 'OTHER'
  filePath: string
  fileName: string
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.candidateDocument.findFirst({
      where: { onboardingId: input.onboardingId, category: input.documentKey, archived: 0 },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, reviewStatus: true },
    })
    if (existing?.reviewStatus === 'APPROVED') {
      throw new PublicOnboardingError('This document is already approved. Contact HR if it needs changing.', 409)
    }
    const data = {
      filePath: input.filePath,
      fileName: input.fileName,
      type: input.type,
      uploadedBy: 'candidate',
      reviewStatus: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
    }
    if (existing) {
      await tx.candidateDocument.update({ where: { id: existing.id }, data })
    } else {
      await tx.candidateDocument.create({
        data: { ...data, companyId: input.companyId, candidateId: input.candidateId, onboardingId: input.onboardingId, category: input.documentKey },
      })
    }
    await setDocumentTaskStatus(tx, input.onboardingId, input.documentKey, 'IN_PROGRESS')
  })
}

/**
 * Records the new hire's answer for a date-field task (such as date of birth): validates it, stores it on the
 * onboarding's metadata (copied to the staff record on hire), and marks the task done.
 */
export async function recordCandidateDateField(input: {
  onboardingId: string
  taskId: string
  dateOfBirth: string
  metadata: Prisma.JsonValue | null
}): Promise<void> {
  const meta = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}
  await prisma.$transaction(async (tx) => {
    await tx.onboarding.update({
      where: { id: input.onboardingId },
      data: { metadata: { ...meta, dateOfBirth: input.dateOfBirth }, updatedBy: 'candidate' },
    })
    await tx.onboardingTask.update({
      where: { id: input.taskId },
      data: { status: 'DONE', completedAt: new Date() },
    })
  })
}
