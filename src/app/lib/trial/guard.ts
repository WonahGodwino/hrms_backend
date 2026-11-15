// Server-side enforcement of free-trial rules. Call from the routes that create
// or send things; the browser is never the enforcer. UNRESTRICTED companies (all
// paid and legacy companies) pass every check with no extra query beyond one
// company lookup.
import { randomUUID } from 'crypto'
import { prisma } from '@/app/lib/db'
import {
  CAPACITY_LABEL,
  READ_ONLY_DAYS,
  METRIC_LABEL,
  METRIC_LIMIT_KEY,
  limitsForProfile,
  type TrialCapacity,
  type TrialLimits,
  type TrialMetric,
  type TrialStatus,
} from './limits'

const DAY_MS = 24 * 60 * 60 * 1000

export class TrialRestrictionError extends Error {
  status: number
  code: string
  constructor(message: string, code: string, status = 403) {
    super(message)
    this.name = 'TrialRestrictionError'
    this.code = code
    this.status = status
  }
}

export interface TrialState {
  status: TrialStatus
  restricted: boolean
  readOnly: boolean
  limits: TrialLimits
  trialEndsAt: Date | null
  daysLeft: number | null
}

const UNRESTRICTED_STATE: TrialState = {
  status: 'UNRESTRICTED',
  restricted: false,
  readOnly: false,
  limits: limitsForProfile('standard'),
  trialEndsAt: null,
  daysLeft: null,
}

// Status is derived from the clock on every read, so no cron has to flip it for
// enforcement to be correct (the cron only sends reminders and persists status).
export async function getTrialState(companyId: string | null | undefined): Promise<TrialState> {
  if (!companyId) return UNRESTRICTED_STATE
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      trialStatus: true,
      trialEndsAt: true,
      trialExtraDays: true,
      trialLimitsProfile: true,
    },
  })
  if (!c || c.trialStatus === 'UNRESTRICTED') return UNRESTRICTED_STATE

  let status = c.trialStatus as TrialStatus
  const limits = limitsForProfile(c.trialLimitsProfile)
  const end = c.trialEndsAt ? new Date(c.trialEndsAt.getTime() + (c.trialExtraDays || 0) * DAY_MS) : null

  if (status === 'TRIAL' && end) {
    const now = Date.now()
    if (now > end.getTime() + READ_ONLY_DAYS * DAY_MS) status = 'ARCHIVED'
    else if (now > end.getTime()) status = 'READ_ONLY'
  }

  const daysLeft = end && status === 'TRIAL' ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / DAY_MS)) : null
  const readOnly = status !== 'TRIAL'
  return { status, restricted: true, readOnly, limits, trialEndsAt: end, daysLeft }
}

// Any create / edit / send / import must pass this first.
export async function assertTrialWritable(companyId: string | null | undefined): Promise<TrialState> {
  const state = await getTrialState(companyId)
  if (state.restricted && state.readOnly) {
    throw new TrialRestrictionError(
      state.status === 'HELD' || state.status === 'DECLINED'
        ? 'Your account is being verified. You will be notified once it is ready.'
        : 'Your trial has ended and the account is read only. Subscribe to continue.',
      'TRIAL_READ_ONLY',
    )
  }
  return state
}

// Exports and document downloads are switched off for the whole trial.
export async function assertExportsAllowed(companyId: string | null | undefined): Promise<void> {
  const state = await getTrialState(companyId)
  if (state.restricted) {
    throw new TrialRestrictionError(
      'Exports and downloads are not included in the trial. You can review everything on screen.',
      'TRIAL_EXPORT_DISABLED',
    )
  }
}

export async function getTrialUsage(companyId: string, metric: TrialMetric): Promise<number> {
  return prisma.trialUsageCounter.count({ where: { companyId, metric } })
}

// Reserves quota slots for the given subjects (e.g. staff ids). Subjects already
// counted are free, so re-sending the same payslip to one person uses one slot.
// Slots are never returned when a record is deleted.
export async function consumeTrialQuota(
  companyId: string | null | undefined,
  metric: TrialMetric,
  subjectKeys: string[],
): Promise<void> {
  const state = await assertTrialWritable(companyId)
  if (!state.restricted || !companyId || subjectKeys.length === 0) return

  const limit = state.limits[METRIC_LIMIT_KEY[metric]] as number
  const unique = Array.from(new Set(subjectKeys))
  const existing = await prisma.trialUsageCounter.findMany({
    where: { companyId, metric, subjectKey: { in: unique } },
    select: { subjectKey: true },
  })
  const known = new Set(existing.map((e) => e.subjectKey))
  const fresh = unique.filter((k) => !known.has(k))
  if (fresh.length === 0) return

  const used = await getTrialUsage(companyId, metric)
  if (used + fresh.length > limit) {
    throw new TrialRestrictionError(
      `The trial includes ${limit} ${METRIC_LABEL[metric]} (${used} used). Subscribe to continue.`,
      'TRIAL_QUOTA_REACHED',
      402,
    )
  }
  await prisma.trialUsageCounter.createMany({
    data: fresh.map((subjectKey) => ({ companyId, metric, subjectKey })),
    skipDuplicates: true,
  })
  if (metric === 'payslips') {
    const { checkPayslipBehaviour } = await import('./behavior')
    await checkPayslipBehaviour(companyId, used + fresh.length, limit)
  }
}

// Staff messages: a trial company may email its staff at most `staffEmailsPerDay` times a
// day (UTC). Returns false, without throwing, when the day's allowance is used up so a
// notification never crashes the action that triggered it. Paid companies always get true.
export async function reserveStaffEmailSlot(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return true
  const state = await getTrialState(companyId)
  if (!state.restricted) return true
  const day = new Date().toISOString().slice(0, 10)
  const used = await prisma.trialUsageCounter.count({ where: { companyId, metric: 'staffEmailDay', subjectKey: { startsWith: `${day}:` } } })
  if (used >= state.limits.staffEmailsPerDay) return false
  await prisma.trialUsageCounter.create({ data: { companyId, metric: 'staffEmailDay', subjectKey: `${day}:${randomUUID()}` } })
  return true
}

// Bytes of user-uploaded documents a company holds (CVs, offer templates, onboarding documents,
// leave and recognition attachments, training files). System-generated payslips and letters are
// not counted.
export async function getStorageUsedBytes(companyId: string): Promise<number> {
  const [cand, tmpl, onboarding, leave, recog, training] = await Promise.all([
    prisma.candidateFile.aggregate({ where: { companyId }, _sum: { sizeBytes: true } }),
    prisma.offerLetterTemplate.aggregate({ where: { companyId }, _sum: { fileSize: true } }),
    prisma.staffOnboardingDocument.aggregate({ where: { companyId }, _sum: { sizeBytes: true } }),
    prisma.leaveRequest.aggregate({ where: { companyId }, _sum: { attachmentSize: true } }),
    prisma.recognition.aggregate({ where: { companyId }, _sum: { attachmentSize: true } }),
    prisma.trainingMaterial.aggregate({ where: { companyId }, _sum: { fileSizeBytes: true } }),
  ])
  return (
    (cand._sum.sizeBytes ?? 0) +
    (tmpl._sum.fileSize ?? 0) +
    (onboarding._sum.sizeBytes ?? 0) +
    (leave._sum.attachmentSize ?? 0) +
    (recog._sum.attachmentSize ?? 0) +
    Number(training._sum.fileSizeBytes ?? 0)
  )
}

// Call before storing an upload. Trial companies are held to `storageMb`; everyone else passes.
export async function assertStorageQuota(companyId: string | null | undefined, incomingBytes: number): Promise<void> {
  const state = await getTrialState(companyId)
  if (!state.restricted || !companyId) return
  const used = await getStorageUsedBytes(companyId)
  const limitBytes = state.limits.storageMb * 1024 * 1024
  if (used + incomingBytes > limitBytes) {
    throw new TrialRestrictionError(
      `The trial includes ${state.limits.storageMb} MB of document storage (${Math.round(used / 1024 / 1024)} MB used). Subscribe to add more.`,
      'TRIAL_QUOTA_REACHED',
      402,
    )
  }
}

// Staff cap: the higher of live records and every record ever counted, so
// deleting a staff member does not hand the slot back. Call before creating
// `adding` records; call recordStaffCreated after each one is created.
export async function assertStaffCapacity(companyId: string | null | undefined, adding = 1): Promise<void> {
  const state = await assertTrialWritable(companyId)
  if (!state.restricted || !companyId) return
  const [live, counted] = await Promise.all([
    prisma.staffRecord.count({ where: { companyId } }),
    getTrialUsage(companyId, 'staff'),
  ])
  const used = Math.max(live, counted)
  if (used + adding > state.limits.staff) {
    throw new TrialRestrictionError(
      `The trial includes ${state.limits.staff} staff records (${used} used). Subscribe to add more.`,
      'TRIAL_QUOTA_REACHED',
      402,
    )
  }
}

export async function recordStaffCreated(companyId: string | null | undefined, staffRecordId: string): Promise<void> {
  if (!companyId) return
  const state = await getTrialState(companyId)
  if (!state.restricted) return
  await prisma.trialUsageCounter.createMany({
    data: [{ companyId, metric: 'staff', subjectKey: staffRecordId }],
    skipDuplicates: true,
  })
  const { checkStaffBehaviour } = await import('./behavior')
  await checkStaffBehaviour(companyId)
}

// Bulk form of recordStaffCreated: one trial lookup and one insert for a whole upload.
export async function recordStaffCreatedMany(companyId: string | null | undefined, staffRecordIds: string[]): Promise<void> {
  if (!companyId || staffRecordIds.length === 0) return
  const state = await getTrialState(companyId)
  if (!state.restricted) return
  await prisma.trialUsageCounter.createMany({
    data: staffRecordIds.map((subjectKey) => ({ companyId, metric: 'staff', subjectKey })),
    skipDuplicates: true,
  })
  const { checkStaffBehaviour } = await import('./behavior')
  await checkStaffBehaviour(companyId)
}

// Live-record counters for the structural limits in section 3 of the trial paper.
const CAPACITY_COUNTERS: Record<TrialCapacity, (companyId: string) => Promise<number>> = {
  adminUsers: (companyId) => prisma.staffRecord.count({ where: { companyId, role: { in: ['ADMIN', 'HR'] } } }),
  departments: (companyId) => prisma.department.count({ where: { companyId } }),
  businessUnits: (companyId) => prisma.businessUnit.count({ where: { companyId } }),
  designations: (companyId) => prisma.designation.count({ where: { companyId } }),
  payrollTemplates: (companyId) => prisma.payrollTemplate.count({ where: { companyId } }),
  openJobs: (companyId) => prisma.job.count({ where: { companyId, status: { in: ['DRAFT', 'ACTIVE'] }, OR: [{ archived: 0 }, { archived: null }] } }),
  courses: (companyId) => prisma.trainingProgram.count({ where: { companyId, status: { not: 'ARCHIVED' } } }),
  certificationTypes: (companyId) => prisma.certificationType.count({ where: { companyId } }),
  sampleLoans: (companyId) => prisma.loanRequest.count({ where: { companyId } }),
}

function capacityError(limit: number, label: string, used: number): TrialRestrictionError {
  return new TrialRestrictionError(
    `The trial includes ${limit} ${label} (${used} used). Subscribe to add more.`,
    'TRIAL_QUOTA_REACHED',
    402,
  )
}

// Call before creating `adding` records of a structurally limited kind.
export async function assertTrialCapacity(
  companyId: string | null | undefined,
  capacity: TrialCapacity,
  adding = 1,
): Promise<void> {
  const state = await assertTrialWritable(companyId)
  if (!state.restricted || !companyId || adding <= 0) return
  const limit = state.limits[capacity]
  const used = await CAPACITY_COUNTERS[capacity](companyId)
  if (used + adding > limit) throw capacityError(limit, CAPACITY_LABEL[capacity], used)
}

// Recruitment: each job takes a capped number of applicants.
export async function assertApplicantCapacity(
  companyId: string | null | undefined,
  jobId: string,
  adding = 1,
): Promise<void> {
  const state = await assertTrialWritable(companyId)
  if (!state.restricted || !companyId || adding <= 0) return
  const limit = state.limits.applicantsPerJob
  const used = await prisma.jobApplication.count({ where: { companyId, jobId } })
  if (used + adding > limit) throw capacityError(limit, 'applicants per job', used)
}

// Returns a response body for a trial error, or null for any other error.
export function trialErrorBody(err: unknown): { status: number; message: string; code: string } | null {
  if (err instanceof TrialRestrictionError) {
    return { status: err.status, message: err.message, code: err.code }
  }
  return null
}
