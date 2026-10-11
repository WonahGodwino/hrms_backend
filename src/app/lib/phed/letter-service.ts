// ============================================================
// Promotion letters — shared service functions (DB + generation).
// ============================================================

import { prisma } from '@/app/lib/db'
import { buildLetterPdf } from './pdf-letter'
import { deleteRunFiles, letterFileName, writeRunFile } from './letter-storage'
import {
  CANONICAL_LETTER_BODY, CANONICAL_LETTERHEAD, LETTER_TOKENS,
} from './letter-engine/token-map'
import type { RenderModel, TemplateConfig } from './letter-engine/types'

export const LETTER_TYPE = 'SALARY_INCREASE'

/** Strip stack traces / internals from an error for operator-facing messages. */
export function plainError(e: unknown): string {
  if (e instanceof Error) return e.message || 'Unknown error'
  return typeof e === 'string' ? e : 'Unknown error'
}

/** Resolve the operating company (SUPER_ADMIN may pick; others are locked to their own). */
export function resolveLetterCompany(user: { role: string; companyId?: string | null }, requested?: string | null): string | null {
  if (user.role === 'SUPER_ADMIN') return requested || user.companyId || null
  return user.companyId || null
}

/** Best-effort client IP from common proxy headers (for the audit trail). */
export function clientIp(headers: { get: (name: string) => string | null }): string | null {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim() || null
  return headers.get('x-real-ip') || null
}

/** Latest template for a company, seeding the canonical one on first use. */
export async function getOrSeedTemplate(companyId: string, actorId: string): Promise<any> {
  const existing = await (prisma as any).phedLetterTemplate.findFirst({
    where: { companyId, type: LETTER_TYPE },
    orderBy: { version: 'desc' },
  })
  if (existing) return existing

  return (prisma as any).phedLetterTemplate.create({
    data: {
      companyId,
      type: LETTER_TYPE,
      version: 1,
      body: CANONICAL_LETTER_BODY,
      letterhead: CANONICAL_LETTERHEAD,
      signatoryName: 'Ajere Angella',
      signatoryTitle: 'Chief People Officer',
      tokens: [...LETTER_TOKENS],
      createdById: actorId,
    },
  })
}

function templateToConfig(template: any): TemplateConfig {
  return {
    type: template.type,
    version: template.version,
    body: template.body,
    letterhead: template.letterhead,
    signatoryName: template.signatoryName,
    signatoryTitle: template.signatoryTitle,
    tokens: Array.isArray(template.tokens) ? template.tokens : [],
  }
}

export { templateToConfig }

/** Append-only audit event (detail carries no names/salaries/emails). */
export async function auditLetterEvent(
  companyId: string,
  actorId: string,
  action: string,
  runId?: string | null,
  detail?: string | null,
  ip?: string | null,
): Promise<void> {
  await (prisma as any).phedLetterAuditEvent.create({
    data: { companyId, actorId, action, runId: runId ?? null, detail: detail ?? null, ip: ip ?? null },
  })
}

/** Recompute live progress counts from a run's rows. */
export async function runProgress(runId: string) {
  const rows = await (prisma as any).phedLetterRunRow.findMany({
    where: { runId },
    select: { status: true },
  })
  const count = (s: string) => rows.filter((r: any) => r.status === s).length
  return {
    pending: count('PENDING'),
    excluded: count('EXCLUDED'),
    queued: count('QUEUED'),
    generated: count('GENERATED'),
    failed: count('FAILED'),
  }
}

// ── Retention (FR-17) ────────────────────────────────────────────────────
export const LETTER_RETENTION_DAYS = 30
const RETENTION_MS = LETTER_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** Expiry timestamp for a run's generated files (now + retention window). */
export function retentionExpiry(): Date {
  return new Date(Date.now() + RETENTION_MS)
}

export function isRunExpired(run: { filesExpireAt?: Date | string | null } | null | undefined): boolean {
  return Boolean(run?.filesExpireAt && new Date(run.filesExpireAt).getTime() <= Date.now())
}

async function expireRun(run: { id: string; companyId: string }): Promise<void> {
  try { deleteRunFiles(run.companyId, run.id) } catch (e) { console.warn('[letter] file purge failed:', e) }
  await (prisma as any).phedLetterRun.update({ where: { id: run.id }, data: { status: 'EXPIRED' } })
  // PII minimisation: purge per-row values once files are gone (findings kept).
  await (prisma as any).phedLetterRunRow.updateMany({
    where: { runId: run.id },
    data: { values: null, outputKey: null },
  })
  await auditLetterEvent(run.companyId, 'system', 'EXPIRED', run.id, 'Retention window elapsed; generated files purged')
}

/** Purge this run if its retention window has elapsed. Returns true when expired. */
export async function expireRunIfNeeded(run: { id: string; companyId: string; status?: string; filesExpireAt?: Date | string | null } | null): Promise<boolean> {
  if (!run) return false
  if (run.status === 'EXPIRED') return true
  if (!isRunExpired(run)) return false
  await expireRun(run)
  return true
}

/** Opportunistic sweep — deletes files for any run past its retention window (no scheduler). */
export async function cleanupExpiredLetterFiles(): Promise<number> {
  const expired = await (prisma as any).phedLetterRun.findMany({
    where: {
      filesExpireAt: { lt: new Date() },
      status: { in: ['COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELLED'] },
    },
    select: { id: true, companyId: true },
    take: 100,
  })
  for (const run of expired) await expireRun(run)
  return expired.length
}

const activeGenerations = new Set<string>()

/**
 * Background generation loop. One PDF per QUEUED row; a failure on one row
 * never stops the others. Stops early when the run is cancelled. Guarded by an
 * in-memory set so concurrent/resumed invocations never double-run a row.
 */
export async function generateRun(runId: string): Promise<void> {
  if (activeGenerations.has(runId)) return
  activeGenerations.add(runId)
  try {
    await generateRunInner(runId)
  } finally {
    activeGenerations.delete(runId)
  }
}

async function generateRunInner(runId: string): Promise<void> {
  const run = await (prisma as any).phedLetterRun.findUnique({ where: { id: runId } })
  if (!run) return

  const template = run.templateId
    ? await (prisma as any).phedLetterTemplate.findUnique({ where: { id: run.templateId } })
    : null
  if (!template) {
    await (prisma as any).phedLetterRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED_WITH_FAILURES', completedAt: new Date(), filesExpireAt: retentionExpiry() },
    })
    return
  }
  const config = templateToConfig(template)

  const rows = await (prisma as any).phedLetterRunRow.findMany({
    where: { runId, status: 'QUEUED' },
    orderBy: { excelRow: 'asc' },
  })

  for (const row of rows) {
    const fresh = await (prisma as any).phedLetterRun.findUnique({
      where: { id: runId },
      select: { status: true },
    })
    if (fresh?.status === 'CANCELLED') return

    const renderModel = (row.values as any)?.renderModel as RenderModel | null
    if (!renderModel) {
      await (prisma as any).phedLetterRunRow.update({
        where: { id: row.id },
        data: { status: 'FAILED', error: 'No render model available for this row.' },
      })
      continue
    }

    try {
      const pdf = await buildLetterPdf(renderModel, config)
      const fileName = letterFileName(renderModel.staff_id, renderModel.staff_name)
      const storageKey = writeRunFile(run.companyId, runId, fileName, pdf)
      await (prisma as any).phedLetterRunRow.update({
        where: { id: row.id },
        data: { status: 'GENERATED', outputKey: storageKey },
      })
    } catch (e) {
      await (prisma as any).phedLetterRunRow.update({
        where: { id: row.id },
        data: { status: 'FAILED', error: plainError(e) },
      })
    }
  }

  await finalizeRun(runId)
}

/** Set a finished run to COMPLETED / COMPLETED_WITH_FAILURES and snapshot counts. */
async function finalizeRun(runId: string): Promise<void> {
  const [run, generated, failed] = await Promise.all([
    (prisma as any).phedLetterRun.findUnique({
      where: { id: runId },
      select: { companyId: true, status: true, counts: true },
    }),
    (prisma as any).phedLetterRunRow.count({ where: { runId, status: 'GENERATED' } }),
    (prisma as any).phedLetterRunRow.count({ where: { runId, status: 'FAILED' } }),
  ])
  if (!run || run.status === 'CANCELLED') return

  await (prisma as any).phedLetterRun.update({
    where: { id: runId },
    data: {
      status: failed > 0 ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED',
      completedAt: new Date(),
      filesExpireAt: retentionExpiry(),
      counts: { ...(run.counts || {}), generated, failed },
    },
  })
  await auditLetterEvent(run.companyId, 'system', 'GENERATION_FINISHED', runId, `generated=${generated} failed=${failed}`)
}

/** Restart-safe recovery — resume GENERATING runs left behind by a crash/restart. */
export async function resumeStuckLetterRuns(): Promise<number> {
  const stale = await (prisma as any).phedLetterRun.findMany({
    where: { status: 'GENERATING' },
    select: { id: true },
    take: 50,
  })
  let resumed = 0
  for (const run of stale) {
    if (activeGenerations.has(run.id)) continue
    const queued = await (prisma as any).phedLetterRunRow.count({ where: { runId: run.id, status: 'QUEUED' } })
    if (queued === 0) {
      await finalizeRun(run.id)
      continue
    }
    void generateRun(run.id).catch((e) => console.error('[letter] resume failed:', e))
    resumed++
  }
  return resumed
}
