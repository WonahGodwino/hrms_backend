// src/app/lib/core-setup/audit.ts
//
// The Core Setup change feed (Activity Log, Record Audit Trail, Bulk Operation History, Automation Audit).
//
// Every event is one row in core_setup_audit_events. A route that changes a record calls recordCoreSetupEvent() with the SAME client
// it used for the change (the `tx` inside prisma.$transaction), so the change and its audit row commit or roll back together. That
// is what makes the feed trustworthy: nothing can be changed without a trace, and nothing is logged that did not happen.
//
// The front end reads the feed through GET /api/core-setup/automation/settings (see serializeAuditEvent for the shape).
import type { NextRequest } from 'next/server'
import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/app/lib/db'

type Db = PrismaClient | Prisma.TransactionClient

export interface AuditActor {
  userId?: string | null
  name: string
  role?: string | null
  type?: 'human' | 'automation'
}

export interface AuditFieldChange {
  field: string
  previousValue?: string
  newValue?: string
  changeType?: 'added' | 'changed' | 'removed' | string
}

export interface AuditRelatedRecord {
  type: string
  name: string
  identifier: string
  status?: string
  relationship?: string
}

export interface AuditDetail {
  label: string
  value: string
}

export interface AuditInput {
  companyId: string
  actor: AuditActor
  kind: 'record' | 'bulk' | 'rule' | 'decision' | 'setting' | 'retention' | 'proposal'
  area?: 'org' | 'staff' | 'ai' | null
  via?: string | null
  action: string
  changeType?: string
  source?: 'manual' | 'approval' | 'automation_rule'
  object?: string
  summary?: string
  reason?: string
  status?: string
  result?: string
  fieldChanges?: AuditFieldChange[]
  related?: AuditRelatedRecord[]
  details?: AuditDetail[]
  correlationId?: string
}

// The Action Center sends X-Change-Source: action_center while it applies an approved change, so the audit row can say the change
// came from an approval rather than from a person editing the record directly.
export function changeSourceOf(request: NextRequest): string {
  return request.headers.get('x-change-source') === 'action_center' ? 'action_center' : ''
}

// Who is acting, for the audit row. The token carries the staff record id; the name comes from that record.
export async function actorFor(user: { userId: string; role: string; email?: string }): Promise<AuditActor> {
  try {
    const staff = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true, email: true },
    })
    const name = staff ? `${staff.firstName ?? ''} ${staff.lastName ?? ''}`.trim() || staff.email : user.email || 'User'
    return { userId: user.userId, name: name || 'User', role: user.role, type: 'human' }
  } catch {
    return { userId: user.userId, name: user.email || 'User', role: user.role, type: 'human' }
  }
}

const SKIP_FIELDS = new Set(['updatedAt', 'createdAt', 'id', 'updatedBy', 'createdBy'])
const nice = (k: string) =>
  k
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
const show = (v: unknown) =>
  v === undefined || v === null || v === '' ? 'Not set' : typeof v === 'object' ? JSON.stringify(v) : String(v)
const empty = (v: unknown) => v === undefined || v === null || v === ''

// Field-by-field difference between two versions of a record, in the shape the audit drawers show.
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  skip: string[] = [],
): AuditFieldChange[] {
  const skipSet = new Set([...SKIP_FIELDS, ...skip])
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => !skipSet.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  )
  // An id that changed together with its name (departmentId with department) is one change, shown by name.
  const named = keys.filter((k) => !(/Id$/.test(k) && keys.includes(k.slice(0, -2))))
  return named.map((k) => ({
    field: nice(k),
    previousValue: show(before[k]),
    newValue: show(after[k]),
    changeType: empty(before[k]) ? 'added' : empty(after[k]) ? 'removed' : 'changed',
  }))
}

export async function recordCoreSetupEvent(db: Db, input: AuditInput) {
  const resultFor =
    input.result ??
    (input.status === 'rejected' ? 'Rejected' : input.status === 'approved' ? 'Approved' : input.kind === 'record' || input.kind === 'bulk' ? 'Applied' : 'Saved')
  return db.coreSetupAuditEvent.create({
    data: {
      companyId: input.companyId,
      correlationId: input.correlationId ?? `CORESETUP-${input.kind.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      kind: input.kind,
      area: input.area ?? null,
      via: input.via ?? null,
      action: input.action,
      changeType: input.changeType ?? null,
      source: input.source ?? (input.kind === 'rule' ? 'automation_rule' : input.kind === 'decision' || input.via === 'action_center' ? 'approval' : 'manual'),
      object: input.object ?? null,
      summary: input.summary ?? null,
      reason: input.reason ?? null,
      status: input.status ?? null,
      result: resultFor,
      actorId: input.actor.userId ?? null,
      actorName: input.actor.name,
      actorRole: input.actor.role ?? null,
      fieldChanges: (input.fieldChanges ?? []) as unknown as Prisma.InputJsonValue,
      relatedRecords: (input.related ?? []) as unknown as Prisma.InputJsonValue,
      details: (input.details ?? []) as unknown as Prisma.InputJsonValue,
    },
  })
}

export interface RecordChange {
  companyId: string
  actor: AuditActor
  via?: string
  noun: string // 'Designation'
  type: string // 'designation' (the related-record type)
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  nameOf?: (record: Record<string, unknown>) => string
  skip?: string[]
}

const recordName = (r: Record<string, unknown>) =>
  String(r.fullName ?? ([r.firstName, r.lastName].filter(Boolean).join(' ') || r.name || r.title || r.templateName || r.code || r.id || 'Record'))

// One create, edit or delete of a Core Setup record, with the field values before and after. Pass the record as it was (before) and
// as it is now (after): no before = created, no after = deleted, both = an edit (nothing is written when no field actually changed).
// Call it inside the same prisma.$transaction as the change itself.
export async function auditRecord(db: Db, p: RecordChange) {
  const rec = p.after ?? p.before
  if (!rec) return null
  const nameOf = p.nameOf ?? recordName
  const via = p.via ?? ''
  const related = (r: Record<string, unknown>): AuditRelatedRecord[] => [
    { type: p.type, name: nameOf(r), identifier: String(r.id ?? ''), status: String(r.status ?? 'Active'), relationship: 'Changed' },
  ]
  const details: AuditDetail[] = [
    { label: 'Record', value: `${p.noun}: ${nameOf(rec)}` },
    ...(via === 'action_center' ? [{ label: 'Applied from', value: 'Action Center approval' }] : []),
  ]
  const base = { companyId: p.companyId, actor: p.actor, kind: 'record' as const, area: 'org' as const, via, status: 'success', details }

  if (!p.before && p.after) {
    return recordCoreSetupEvent(db, { ...base, action: `${p.noun} created`, changeType: 'created', object: nameOf(p.after), summary: `${nameOf(p.after)} was added.`, related: related(p.after) })
  }
  if (p.before && !p.after) {
    return recordCoreSetupEvent(db, { ...base, action: `${p.noun} deleted`, changeType: 'deleted', object: nameOf(p.before), summary: `${nameOf(p.before)} was deleted.`, related: related(p.before) })
  }
  const before = p.before as Record<string, unknown>
  const after = p.after as Record<string, unknown>
  const changes = diffFields(before, after, p.skip)
  if (!changes.length) return null
  const statusOnly = changes.length === 1 && changes[0].field === 'Status'
  const action = statusOnly ? `${p.noun} ${/inactive/i.test(String(after.status)) ? 'deactivated' : 'reactivated'}` : `${p.noun} updated`
  return recordCoreSetupEvent(db, {
    ...base,
    action,
    changeType: 'updated',
    object: nameOf(after),
    summary: `${nameOf(after)}: ${changes.slice(0, 3).map((c) => `${c.field} ${c.previousValue} to ${c.newValue}`).join(', ')}${changes.length > 3 ? ` and ${changes.length - 3} more` : ''}.`,
    fieldChanges: changes,
    related: related(after),
  })
}

// A bulk import or upload is one event with the counts (the per-record changes are not each logged).
export async function auditBulk(db: Db, p: { companyId: string; actor: AuditActor; via?: string; label: string; created: number; updated?: number; skipped?: number; area?: 'org' | 'staff' }) {
  const updated = p.updated ?? 0
  return recordCoreSetupEvent(db, {
    companyId: p.companyId,
    actor: p.actor,
    kind: 'bulk',
    area: p.area ?? 'org',
    via: p.via ?? '',
    action: `Bulk operation: ${p.label}`,
    changeType: 'bulk',
    status: 'success',
    object: p.label,
    summary: `${p.label} by ${p.actor.name}: ${p.created} created, ${updated} updated${p.skipped ? `, ${p.skipped} skipped` : ''}.`,
    details: [
      { label: 'Records created', value: String(p.created) },
      { label: 'Records updated', value: String(updated) },
      ...(p.skipped ? [{ label: 'Records skipped', value: String(p.skipped) }] : []),
      { label: 'Records processed', value: String(p.created + updated + (p.skipped ?? 0)) },
    ],
  })
}
type AuditRow = Awaited<ReturnType<typeof prisma.coreSetupAuditEvent.findFirstOrThrow>>

const fmt = (d: Date) =>
  d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

// One row, in the shape the front end's audit drawers and Activity Log read.
export function serializeAuditEvent(row: AuditRow) {
  const day = row.createdAt.toISOString().slice(0, 10)
  return {
    id: `AUD-${day}-${row.id.slice(-6).toUpperCase()}`,
    correlationId: row.correlationId,
    timestamp: fmt(row.createdAt),
    at: row.createdAt.toISOString(),
    kind: row.kind,
    area: row.area,
    via: row.via ?? '',
    actor: { name: row.actorName ?? 'User', type: row.actorRole === 'AUTOMATION' ? 'automation' : 'human', role: row.actorRole },
    action: row.action,
    changeType: row.changeType,
    source: row.source,
    object: row.object,
    summary: row.summary,
    reason: row.reason ?? '',
    status: row.status,
    result: row.result,
    fieldChanges: (row.fieldChanges ?? []) as unknown as AuditFieldChange[],
    relatedRecords: (row.relatedRecords ?? []) as unknown as AuditRelatedRecord[],
    expandedDetails: (row.details ?? []) as unknown as AuditDetail[],
  }
}

// Department and business unit changes were already logged by the developers' own tables. They are folded into the same feed so
// the Activity Log shows them next to everything else without rewriting those routes.
export async function legacyOrgEvents(companyId: string, take = 200) {
  const [departments, businessUnits] = await Promise.all([
    prisma.departmentAuditLog.findMany({
      where: { companyId },
      orderBy: { timestamp: 'desc' },
      take,
      include: { department: { select: { name: true } } },
    }),
    prisma.businessUnitAuditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { businessUnit: { select: { name: true } } },
    }),
  ])

  const detailsOf = (raw: unknown): AuditDetail[] => {
    if (!raw) return []
    let value: unknown = raw
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw)
      } catch {
        return [{ label: 'Details', value: raw }]
      }
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ label: nice(k), value: show(v) }))
    }
    return [{ label: 'Details', value: show(value) }]
  }

  const events: ReturnType<typeof serializeAuditEvent>[] = []
  for (const d of departments) {
    events.push({
      id: `AUD-DEPT-${d.id.slice(-8).toUpperCase()}`,
      correlationId: `CORESETUP-DEPT-${d.id.slice(-8).toUpperCase()}`,
      timestamp: fmt(d.timestamp),
      at: d.timestamp.toISOString(),
      kind: 'record',
      area: 'org',
      via: '',
      actor: { name: d.userName ?? 'User', type: 'human', role: null },
      action: d.action,
      changeType: d.type ?? 'updated',
      source: 'manual',
      object: d.department?.name ?? 'Department',
      summary: `${d.department?.name ?? 'Department'}: ${d.action}`,
      reason: '',
      status: 'success',
      result: 'Applied',
      fieldChanges: [],
      relatedRecords: [{ type: 'department', name: d.department?.name ?? 'Department', identifier: d.departmentId, status: 'Active', relationship: 'Changed' }],
      expandedDetails: detailsOf(d.details),
    })
  }
  for (const b of businessUnits) {
    events.push({
      id: `AUD-BU-${b.id.slice(-8).toUpperCase()}`,
      correlationId: `CORESETUP-BU-${b.id.slice(-8).toUpperCase()}`,
      timestamp: fmt(b.createdAt),
      at: b.createdAt.toISOString(),
      kind: 'record',
      area: 'org',
      via: '',
      actor: { name: b.performedByName ?? 'User', type: 'human', role: null },
      action: b.action,
      changeType: 'updated',
      source: 'manual',
      object: b.businessUnit?.name ?? 'Business unit',
      summary: `${b.businessUnit?.name ?? 'Business unit'}: ${b.action}`,
      reason: '',
      status: 'success',
      result: 'Applied',
      fieldChanges: [],
      relatedRecords: [{ type: 'business_unit', name: b.businessUnit?.name ?? 'Business unit', identifier: b.businessUnitId, status: 'Active', relationship: 'Changed' }],
      expandedDetails: detailsOf(b.details),
    })
  }
  return events
}

// ---- route helpers: log a change without ever failing the request that made it. Call after the change has been saved.
export async function logRecordChange(request: NextRequest, user: { userId: string; role: string; email?: string }, p: Omit<RecordChange, 'actor' | 'via'>) {
  try {
    await auditRecord(prisma, { ...p, actor: await actorFor(user), via: changeSourceOf(request) })
  } catch (error) {
    console.error('Core Setup audit failed:', error)
  }
}

export async function logBulkChange(request: NextRequest, user: { userId: string; role: string; email?: string }, p: Omit<Parameters<typeof auditBulk>[1], 'actor' | 'via'>) {
  try {
    await auditBulk(prisma, { ...p, actor: await actorFor(user), via: changeSourceOf(request) })
  } catch (error) {
    console.error('Core Setup audit failed:', error)
  }
}
