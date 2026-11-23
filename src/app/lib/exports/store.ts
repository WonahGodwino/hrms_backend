// Files prepared in the background for "your file is ready" downloads (PERF-003).
//
// Each export has a small JSON record and, once ready, the file itself, both under
// uploads/exports/ (private: never served statically). Records are deleted after
// EXPORT_TTL_MS. Ids are random UUIDs and are validated before any path is built.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export type ExportStatus = 'queued' | 'running' | 'ready' | 'failed'

export type ExportRecord = {
  id: string
  userId: string
  /** API path and query the file is produced from, e.g. /api/attendance/export?format=pdf */
  source: string
  status: ExportStatus
  createdAt: string
  updatedAt: string
  fileName?: string
  contentType?: string
  size?: number
  message?: string
}

/** How long a prepared file can be downloaded. */
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000
/** Most files one person can have waiting or being prepared at once. */
export const MAX_ACTIVE_EXPORTS_PER_USER = 3
/** A queued or running export older than this no longer counts as active (its job has expired). */
const ACTIVE_WINDOW_MS = 45 * 60 * 1000
const SWEEP_EVERY_MS = 10 * 60 * 1000

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const exportsDir = () => path.join(process.cwd(), 'uploads', 'exports')
export const isExportId = (id: string) => ID_PATTERN.test(id)
export const newExportId = () => crypto.randomUUID()

const recordPath = (id: string) => path.join(exportsDir(), `${id}.json`)
export const exportFilePath = (id: string) => path.join(exportsDir(), `${id}.file`)

function assertId(id: string) {
  if (!isExportId(id)) throw new Error('Invalid export id')
}

export async function writeExportRecord(record: ExportRecord): Promise<void> {
  assertId(record.id)
  await fs.mkdir(exportsDir(), { recursive: true })
  const tmp = `${recordPath(record.id)}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(record))
  await fs.rename(tmp, recordPath(record.id))
}

export async function updateExportRecord(id: string, patch: Partial<ExportRecord>): Promise<ExportRecord | null> {
  const current = await readExportRecord(id)
  if (!current) return null
  const next = { ...current, ...patch, id: current.id, userId: current.userId, updatedAt: new Date().toISOString() }
  await writeExportRecord(next)
  return next
}

export async function readExportRecord(id: string): Promise<ExportRecord | null> {
  if (!isExportId(id)) return null
  try {
    return JSON.parse(await fs.readFile(recordPath(id), 'utf8')) as ExportRecord
  } catch (_e) {
    return null
  }
}

export async function saveExportFile(id: string, data: Buffer): Promise<void> {
  assertId(id)
  await fs.mkdir(exportsDir(), { recursive: true })
  await fs.writeFile(exportFilePath(id), data)
}

export async function readExportFile(id: string): Promise<Buffer | null> {
  if (!isExportId(id)) return null
  try {
    return await fs.readFile(exportFilePath(id))
  } catch (_e) {
    return null
  }
}

export async function removeExport(id: string): Promise<void> {
  if (!isExportId(id)) return
  await Promise.all([recordPath(id), exportFilePath(id)].map((p) => fs.rm(p, { force: true })))
}

async function allRecords(): Promise<ExportRecord[]> {
  let names: string[]
  try {
    names = await fs.readdir(exportsDir())
  } catch (_e) {
    return [] // folder not created yet
  }
  const ids = names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter(isExportId)
  const records = await Promise.all(ids.map(readExportRecord))
  return records.filter((r): r is ExportRecord => r !== null)
}

/** Exports this user is still waiting for (queued or running, and recent). */
export async function countActiveExports(userId: string, now = Date.now()): Promise<number> {
  return (await allRecords()).filter((r) =>
    r.userId === userId && (r.status === 'queued' || r.status === 'running') && now - Date.parse(r.createdAt) < ACTIVE_WINDOW_MS,
  ).length
}

let lastSweep = 0
/** Deletes exports older than EXPORT_TTL_MS. Runs at most every 10 minutes per process. */
export async function sweepExpiredExports(now = Date.now(), force = false): Promise<number> {
  if (!force && now - lastSweep < SWEEP_EVERY_MS) return 0
  lastSweep = now
  const expired = (await allRecords()).filter((r) => now - Date.parse(r.createdAt) > EXPORT_TTL_MS)
  await Promise.all(expired.map((r) => removeExport(r.id)))
  return expired.length
}

/** File name from a Content-Disposition header (RFC 5987 form first), or the fallback. */
export function fileNameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim())
    } catch (_e) {
      // malformed encoding: fall through to the plain form
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1].trim() : fallback
}
