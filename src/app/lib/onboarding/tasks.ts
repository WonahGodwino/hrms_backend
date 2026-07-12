// Shared helpers for the onboarding-checklist task endpoints.
// The `note` column is accessed via raw SQL so the feature keeps working before
// the additive migration is applied (it simply returns/persists no note yet),
// and needs no Prisma client regeneration once the column exists.
import { prisma } from '@/app/lib/db'

export interface ScopedOnboarding {
  id: string
  staffRecordId: string | null
  candidateName: string
}

// Loads an onboarding scoped to the company, returning the candidate's display
// name (used to classify a task's assignee as candidate vs. internal).
export async function loadScopedOnboarding(id: string, companyId: string): Promise<ScopedOnboarding | null> {
  const onboarding = await prisma.onboarding.findFirst({
    where: { id, companyId },
    include: { offer: { include: { candidate: { select: { firstName: true, lastName: true } } } } },
  })
  if (!onboarding) return null
  const c = (onboarding as any).offer?.candidate
  const candidateName = c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : ''
  return { id: onboarding.id, staffRecordId: onboarding.staffRecordId || null, candidateName }
}

// Reads task notes defensively; returns {} if the column doesn't exist yet.
export async function fetchNotes(onboardingId: string): Promise<Record<string, string>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; note: string | null }>>(
      'SELECT id, note FROM onboarding_tasks WHERE onboarding_id = $1',
      onboardingId
    )
    const map: Record<string, string> = {}
    for (const r of rows) if (r.note != null) map[r.id] = r.note
    return map
  } catch {
    return {}
  }
}

// Persists a task note defensively (no-op if the column doesn't exist yet).
export async function applyNote(taskId: string, note: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('UPDATE onboarding_tasks SET note = $1 WHERE id = $2', note, taskId)
  } catch {
    /* column not migrated yet — silently skip */
  }
}

export function parseDueDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null
  const d = new Date(String(raw))
  return isNaN(d.getTime()) ? null : d
}

// Shapes a DB task row into the checklist's client contract.
export function shapeTask(t: any, note: string | undefined, candidateName: string) {
  const assignee = t.assigneeId || 'Unassigned'
  const lower = assignee.toLowerCase()
  const assigneeType =
    lower === 'candidate' || (candidateName && lower === candidateName.toLowerCase())
      ? 'candidate'
      : 'internal'
  return {
    id: t.id,
    title: t.title,
    description: t.description || '',
    category: t.department || 'General',
    assignee,
    assigneeType,
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
    completed: t.status === 'DONE',
    completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
    note: note || '',
    status: t.status,
  }
}

// Groups shaped tasks into ordered category sections (first-seen order).
export function groupByCategory(tasks: ReturnType<typeof shapeTask>[]) {
  const order: string[] = []
  const map: Record<string, ReturnType<typeof shapeTask>[]> = {}
  for (const t of tasks) {
    const cat = t.category || 'General'
    if (!map[cat]) {
      map[cat] = []
      order.push(cat)
    }
    map[cat].push(t)
  }
  return order.map((category) => ({ category, tasks: map[category] }))
}
