// Batch payslip download: two or more selected payslips as one ZIP.
//
// The PDFs are already stored on the Payslip rows (fileData), so nothing is
// rendered here: the selected files are read from the database a few at a time
// and streamed into the ZIP as the browser receives it, so memory stays flat
// however many payslips are selected. PDFs are already compressed, so entries
// are stored rather than deflated.
import { Readable } from 'stream'
import { ZipArchive } from 'archiver'
import { prisma } from '@/app/lib/db'
import { safeFileName } from '@/app/lib/excel/sheet-theme'

/** A refusal the route turns into a JSON error with this status. */
export class BulkDownloadError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'BulkDownloadError'
  }
}

export const MAX_BULK_PAYSLIPS = 500
const READ_BATCH = 20

type Actor = { role: string; userId?: string | null }

/** Unique payslip ids from the request body; 1 to MAX_BULK_PAYSLIPS of them. */
export function parseBulkDownloadIds(body: unknown): string[] {
  const raw = body && typeof body === 'object' ? (body as { ids?: unknown }).ids : undefined
  if (!Array.isArray(raw)) throw new BulkDownloadError('ids must be a list of payslip ids', 400)
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()))]
  if (ids.length === 0) throw new BulkDownloadError('Select at least one payslip', 400)
  if (ids.length > MAX_BULK_PAYSLIPS) {
    throw new BulkDownloadError(`You can download up to ${MAX_BULK_PAYSLIPS} payslips at once. Select fewer and try again.`, 400)
  }
  return ids
}

/**
 * Companies whose payslips this user may download, with the same rules as the
 * single download: HR and Admin through their company assignments, Super
 * Admin everywhere. Returns null for "all companies".
 */
export async function downloadableCompanyIds(actor: Actor): Promise<string[] | null> {
  if (actor.role === 'SUPER_ADMIN') return null
  if (actor.role !== 'HR' && actor.role !== 'ADMIN') {
    throw new BulkDownloadError('Only HR and Admin users can download payslips in bulk', 403)
  }
  if (!actor.userId) throw new BulkDownloadError('User information not found in authentication token', 403)
  const assignments = await prisma.userCompany.findMany({
    where: { userId: actor.userId, role: actor.role },
    select: { companyId: true },
  })
  if (assignments.length === 0) throw new BulkDownloadError(`${actor.role} user is not assigned to any company`, 403)
  return assignments.map((a) => a.companyId)
}

export type BulkPayslipMeta = {
  id: string
  month: string
  year: number
  staffRecord: { staffId: string; firstName: string; lastName: string }
  company: { companyName: string }
}

/** "EMP-001 - Ada Obi - November 2026.pdf", unique within the ZIP. */
export function payslipEntryName(p: BulkPayslipMeta, used: Set<string>): string {
  const staffName = `${p.staffRecord.firstName} ${p.staffRecord.lastName}`.trim()
  const base = safeFileName([p.staffRecord.staffId, staffName, `${p.month} ${p.year}`].filter(Boolean).join(' - ')) || p.id
  let name = `${base}.pdf`
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).pdf`
  used.add(name.toLowerCase())
  return name
}

/** "Payslips - November 2026 (Company).zip" (or "Multiple Periods" / no company when mixed). */
export function payslipZipName(items: BulkPayslipMeta[]): string {
  const periods = new Set(items.map((p) => `${p.month} ${p.year}`))
  const companies = new Set(items.map((p) => p.company.companyName))
  const period = periods.size === 1 ? [...periods][0] : 'Multiple Periods'
  const company = companies.size === 1 ? ` (${[...companies][0]})` : ''
  return safeFileName(`Payslips - ${period}${company}.zip`)
}

/**
 * The selected payslips this user may download that have a stored PDF, in the
 * order they were selected. Others are counted as skipped.
 */
export async function findDownloadablePayslips(ids: string[], companyIds: string[] | null) {
  const found = await prisma.payslip.findMany({
    where: {
      id: { in: ids },
      fileData: { not: null },
      ...(companyIds ? { companyId: { in: companyIds } } : {}),
    },
    select: {
      id: true,
      month: true,
      year: true,
      staffRecord: { select: { staffId: true, firstName: true, lastName: true } },
      company: { select: { companyName: true } },
    },
  })
  const byId = new Map(found.map((p) => [p.id, p]))
  const items = ids.map((id) => byId.get(id)).filter((p): p is BulkPayslipMeta => !!p)
  return { items, skipped: ids.length - items.length }
}

/** Waits until archiver has written `count` more entries (keeps memory bounded). */
function entriesWritten(archive: ZipArchive, count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (count === 0) return resolve()
    let left = count
    const onEntry = () => {
      if (--left === 0) {
        archive.off('entry', onEntry)
        archive.off('error', onError)
        resolve()
      }
    }
    const onError = (err: Error) => {
      archive.off('entry', onEntry)
      reject(err)
    }
    archive.on('entry', onEntry)
    archive.once('error', onError)
  })
}

/** Streams the ZIP: PDFs are read READ_BATCH at a time and appended as the client reads. */
export function streamPayslipZip(items: BulkPayslipMeta[]): ReadableStream<Uint8Array> {
  const archive = new ZipArchive({ store: true })
  const used = new Set<string>()

  void (async () => {
    try {
      for (let i = 0; i < items.length; i += READ_BATCH) {
        const batch = items.slice(i, i + READ_BATCH)
        const files = await prisma.payslip.findMany({
          where: { id: { in: batch.map((p) => p.id) } },
          select: { id: true, fileData: true },
        })
        const dataById = new Map(files.map((f) => [f.id, f.fileData]))
        const ready = batch.filter((p) => dataById.get(p.id))
        const written = entriesWritten(archive, ready.length)
        for (const p of ready) {
          archive.append(Buffer.from(dataById.get(p.id) as Uint8Array), { name: payslipEntryName(p, used) })
        }
        await written
      }
      await archive.finalize()
    } catch (err) {
      archive.destroy(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>
}
