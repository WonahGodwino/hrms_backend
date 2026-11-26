// Daily work-anniversary notifications: for each company, every active HR/ADMIN user gets an
// in-app notification for each staff member whose anniversary (1 year or more) is today.
// A notification already sent for that staff member and year of service is not sent again.
import { prisma } from '@/app/lib/db'
import { forCompany } from '@/app/lib/data/tenant'
import {
  ANNIVERSARY_NOTIFICATION_TYPE,
  anniversaryKey,
  anniversaryKeyFromData,
  nextAnniversary,
  startOfUtcDay,
  isAnniversaryToday,
} from '@/app/lib/staff/anniversaries'

const RECIPIENT_ROLES = ['HR', 'ADMIN']
// Earlier notifications for the same anniversary can only be from the last few days.
const DEDUPE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

export type AnniversaryNotifyResult = { companyId: string; celebrants: number; created: number; skipped: number }

export async function notifyAnniversariesForCompany(companyId: string, today: Date): Promise<AnniversaryNotifyResult> {
  const db = forCompany(companyId)
  const day = startOfUtcDay(today)
  const staff = await db.staffRecord.findMany({
    where: { isActive: true, hireDate: { not: null } },
    select: { id: true, firstName: true, lastName: true, hireDate: true },
  })
  const celebrants = staff.flatMap((s) => {
    if (!s.hireDate || !isAnniversaryToday(s.hireDate, day)) return []
    const next = nextAnniversary(s.hireDate, day)
    return next ? [{ ...s, years: next.years }] : []
  })
  if (celebrants.length === 0) return { companyId, celebrants: 0, created: 0, skipped: 0 }

  const recipients = await db.staffRecord.findMany({
    where: { isActive: true, role: { in: RECIPIENT_ROLES } },
    select: { id: true },
  })
  if (recipients.length === 0) return { companyId, celebrants: celebrants.length, created: 0, skipped: 0 }

  const existing = await db.notification.findMany({
    where: { type: ANNIVERSARY_NOTIFICATION_TYPE, createdAt: { gte: new Date(day.getTime() - DEDUPE_LOOKBACK_MS) } },
    select: { userId: true, data: true },
  })
  const sent = new Set(existing.map((n) => `${n.userId}|${anniversaryKeyFromData(n.data)}`))

  const rows: { userId: string; companyId: string; type: string; title: string; message: string; data: object; read: boolean }[] = []
  let skipped = 0
  for (const c of celebrants) {
    const key = anniversaryKey(c.id, c.years)
    const name = `${c.firstName} ${c.lastName}`.trim()
    const label = c.years === 1 ? '1 year' : `${c.years} years`
    for (const r of recipients) {
      if (sent.has(`${r.id}|${key}`)) {
        skipped += 1
        continue
      }
      rows.push({
        userId: r.id,
        companyId,
        type: ANNIVERSARY_NOTIFICATION_TYPE,
        title: 'Work anniversary today',
        message: `${name} celebrates ${label} with the company today.`,
        data: { staffRecordId: c.id, years: c.years, anniversaryDate: day.toISOString().slice(0, 10) },
        read: false,
      })
    }
  }
  if (rows.length > 0) await db.notification.createMany({ data: rows })
  return { companyId, celebrants: celebrants.length, created: rows.length, skipped }
}

/** Runs the sweep for one company, or for every company when `companyId` is null. */
export async function notifyAnniversaries(companyId: string | null, today: Date): Promise<AnniversaryNotifyResult[]> {
  const ids = companyId
    ? [companyId]
    : (await prisma.company.findMany({ select: { id: true } })).map((c) => c.id)
  const results: AnniversaryNotifyResult[] = []
  for (const id of ids) results.push(await notifyAnniversariesForCompany(id, today))
  return results
}
