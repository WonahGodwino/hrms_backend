// Behaviour checks on a running trial (document sections 6.2 and 7). A flag quietly moves the
// company to the tight limits profile and queues it for Super_Admin review; nothing is blocked
// outright and the person is told nothing. All checks swallow their own errors: a failed check
// must never break the action that triggered it.
import { prisma } from '@/app/lib/db'

import { limitsForProfile } from './limits'
import { raiseBehaviourFlag } from './review'
import { hashSignal } from './signup/normalize'

const MIN_LIST_SIZE = 3
const FAST_CAP_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const SIGNAL_RETENTION_MS = 24 * 30 * DAY_MS

export const FLAG_FAST_CAP = 'Reached the staff cap within 30 minutes of starting the trial'
export const FLAG_LIST_MATCH = 'Uploaded a staff list matching an earlier trial'
export const FLAG_PAYSLIPS_DAY_ONE = 'Sent the maximum payslips on the first day'

// Pure: hash of the people in a staff list (HR and demo records excluded), order-insensitive.
export function staffListFingerprint(emails: string[]): string | null {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))).sort()
  if (unique.length < MIN_LIST_SIZE) return null
  return hashSignal('STAFF_LIST', unique.join('|'))
}

// Pure: how long after the trial started a milestone happened.
export function isWithin(startsAt: Date | null, now: Date, ms: number): boolean {
  return !!startsAt && now.getTime() - startsAt.getTime() <= ms
}

export async function checkStaffBehaviour(companyId: string, now = new Date()) {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { trialStatus: true, trialStartsAt: true, trialLimitsProfile: true },
    })
    if (!company || company.trialStatus !== 'TRIAL') return

    const staff = await prisma.staffRecord.findMany({ where: { companyId }, select: { email: true, role: true, isDemo: true } })
    const limit = limitsForProfile(company.trialLimitsProfile).staff
    // Demo staff come from a button, so only real records count towards "filled it in minutes".
    if (staff.filter((s) => !s.isDemo).length >= limit && isWithin(company.trialStartsAt, now, FAST_CAP_MS)) {
      await raiseBehaviourFlag(companyId, FLAG_FAST_CAP)
    }

    const fingerprint = staffListFingerprint(staff.filter((s) => s.role !== 'HR' && !s.isDemo).map((s) => s.email))
    if (!fingerprint) return
    const earlier = await prisma.trialSignal.findFirst({
      where: { kind: 'STAFF_LIST', valueHash: fingerprint, companyId: { not: companyId }, expiresAt: { gt: now } },
      select: { id: true },
    })
    if (earlier) await raiseBehaviourFlag(companyId, FLAG_LIST_MATCH)
    // Keep one current fingerprint per company.
    await prisma.trialSignal.deleteMany({ where: { companyId, kind: 'STAFF_LIST' } })
    await prisma.trialSignal.create({
      data: { companyId, kind: 'STAFF_LIST', valueHash: fingerprint, expiresAt: new Date(now.getTime() + SIGNAL_RETENTION_MS) },
    })
  } catch (e) {
    console.warn('[trial] staff behaviour check failed:', e)
  }
}

export async function checkPayslipBehaviour(companyId: string, used: number, limit: number, now = new Date()) {
  try {
    if (used < limit) return
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { trialStartsAt: true } })
    if (isWithin(company?.trialStartsAt ?? null, now, DAY_MS)) await raiseBehaviourFlag(companyId, FLAG_PAYSLIPS_DAY_ONE)
  } catch (e) {
    console.warn('[trial] payslip behaviour check failed:', e)
  }
}
