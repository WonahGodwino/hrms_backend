// "Add demo staff" (document section 4.4): clearly labelled sample employees so an empty trial
// has something to explore. They count toward the staff cap, never receive email, and are
// removed when the company subscribes (removeDemoStaff).
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

import { prisma } from '@/app/lib/db'

import { assertStaffCapacity, recordStaffCreatedMany, TrialRestrictionError } from './guard'
import { forCompany } from '@/app/lib/data/tenant'

export const DEMO_STAFF_COUNT = 5

const SAMPLES = [
  { firstName: 'Ada', lastName: 'Demo', department: 'Operations', position: 'Operations Officer' },
  { firstName: 'Tunde', lastName: 'Demo', department: 'Finance', position: 'Accountant' },
  { firstName: 'Zainab', lastName: 'Demo', department: 'Sales', position: 'Sales Executive' },
  { firstName: 'Emeka', lastName: 'Demo', department: 'Operations', position: 'Supervisor' },
  { firstName: 'Ngozi', lastName: 'Demo', department: 'Finance', position: 'Payroll Clerk' },
]

export async function addDemoStaff(companyId: string, createdBy: string) {
  const existing = await forCompany(companyId).staffRecord.count({ where: { isDemo: true } })
  if (existing > 0) throw new TrialRestrictionError('Demo staff have already been added.', 'TRIAL_DEMO_EXISTS', 409)

  // Throws (402) if the trial cap leaves no room; demo records are counted like any others.
  await assertStaffCapacity(companyId, DEMO_STAFF_COUNT)

  const password = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10)
  const tag = companyId.slice(-6).toLowerCase()
  const created = await prisma.$transaction(
    SAMPLES.slice(0, DEMO_STAFF_COUNT).map((s, i) =>
      prisma.staffRecord.create({
        data: {
          staffId: `DEMO-${tag}-${i + 1}`,
          // .invalid never resolves, so nothing can be delivered to a demo record.
          email: `demo.${i + 1}.${tag}@demo.247hr.invalid`,
          firstName: `${s.firstName} (Demo)`,
          lastName: s.lastName,
          department: s.department,
          position: s.position,
          password,
          isRegistered: false,
          isActive: true,
          isDemo: true,
          role: 'STAFF',
          requirePasswordChange: true,
          companyId,
          createdBy,
        } as any,
        select: { id: true },
      }),
    ),
  )
  await recordStaffCreatedMany(companyId, created.map((c) => c.id))
  return { added: created.length }
}

// Called when a company subscribes. Counted slots are not refunded by the trial counters, but the
// company is no longer restricted at that point.
export async function removeDemoStaff(companyId: string) {
  const res = await forCompany(companyId).staffRecord.deleteMany({ where: { isDemo: true } })
  return { removed: res.count }
}
