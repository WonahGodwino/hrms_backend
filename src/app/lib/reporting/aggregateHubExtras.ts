// src/app/lib/reporting/aggregateHubExtras.ts
//
// Small count/group-by summaries for modules that have no reporting summary of
// their own (recruitment, training, offboarding, meetings), used by the Reports
// Hub. Everything is a narrow aggregate query scoped to `targetCompanyIds`; no
// row-level data leaves this file.
import { prisma } from '@/app/lib/db'

const db = prisma as any

const toMap = (rows: Array<{ _count: { _all: number } } & Record<string, any>>, key: string) =>
  rows.map((r) => ({ label: String(r[key]), count: r._count._all }))

export async function aggregateRecruitmentSummary(companyIds: string[], start: Date, end: Date) {
  const notArchived = { companyId: { in: companyIds }, archived: 0 }
  const [jobsByStatus, applicationsByStatus, offersByStatus, applicationsInPeriod, hiresInPeriod] = await Promise.all([
    db.job.groupBy({ by: ['status'], where: notArchived, _count: { _all: true } }),
    db.jobApplication.groupBy({ by: ['status'], where: notArchived, _count: { _all: true } }),
    db.offer.groupBy({ by: ['status'], where: notArchived, _count: { _all: true } }),
    db.jobApplication.count({ where: { ...notArchived, createdAt: { gte: start, lt: end } } }),
    db.jobApplication.count({ where: { ...notArchived, status: 'HIRED', createdAt: { gte: start, lt: end } } })
  ])

  const jobs = toMap(jobsByStatus, 'status')
  const offers = toMap(offersByStatus, 'status')
  const countOf = (list: { label: string; count: number }[], label: string) => list.find((x) => x.label === label)?.count || 0

  return {
    openJobs: countOf(jobs, 'ACTIVE'),
    totalJobs: jobs.reduce((a, b) => a + b.count, 0),
    jobsByStatus: jobs,
    applicationsByStage: toMap(applicationsByStatus, 'status'),
    totalApplications: applicationsByStatus.reduce((a: number, r: any) => a + r._count._all, 0),
    applicationsInPeriod,
    hiresInPeriod,
    offersByStatus: offers,
    offersAccepted: countOf(offers, 'ACCEPTED'),
    offersPending: offers.filter((o) => ['PENDING_APPROVAL', 'APPROVED', 'AWAITING_SIGNATURE', 'SENT'].includes(o.label)).reduce((a, b) => a + b.count, 0)
  }
}

export async function aggregateTrainingSummary(companyIds: string[]) {
  const soon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  const [programsByStatus, progressByStatus, certByStatus, certsExpiringSoon] = await Promise.all([
    db.trainingProgram.groupBy({ by: ['status'], where: { companyId: { in: companyIds } }, _count: { _all: true } }),
    db.participantProgress.groupBy({ by: ['trainingStatus'], where: { companyId: { in: companyIds } }, _count: { _all: true } }),
    db.certificationRecord.groupBy({ by: ['status'], where: { companyId: { in: companyIds } }, _count: { _all: true } }),
    db.certificationRecord.count({ where: { companyId: { in: companyIds }, expiryDate: { gte: new Date(), lte: soon } } })
  ])

  const progress = toMap(progressByStatus, 'trainingStatus')
  const enrolments = progress.reduce((a, b) => a + b.count, 0)
  const completed = progress.find((p) => p.label === 'COMPLETED')?.count || 0
  const programs = toMap(programsByStatus, 'status')

  return {
    programsByStatus: programs,
    activePrograms: programs.find((p) => p.label === 'ACTIVE')?.count || 0,
    totalPrograms: programs.reduce((a, b) => a + b.count, 0),
    enrolments,
    completed,
    completionRate: enrolments ? Math.round((completed / enrolments) * 1000) / 10 : 0,
    progressByStatus: progress,
    certificationsByStatus: toMap(certByStatus, 'status'),
    certificationsExpiringIn90Days: certsExpiringSoon
  }
}

export async function aggregateOffboardingSummary(companyIds: string[], start: Date, end: Date) {
  const [byStatus, byType, startedInPeriod] = await Promise.all([
    db.offboarding.groupBy({ by: ['status'], where: { companyId: { in: companyIds } }, _count: { _all: true } }),
    db.offboarding.groupBy({ by: ['type'], where: { companyId: { in: companyIds } }, _count: { _all: true } }),
    db.offboarding.count({ where: { companyId: { in: companyIds }, createdAt: { gte: start, lt: end } } })
  ])
  const statuses = toMap(byStatus, 'status')
  return {
    byStatus: statuses,
    byType: toMap(byType, 'type'),
    startedInPeriod,
    inProgress: statuses.filter((s) => !['COMPLETED', 'REJECTED'].includes(s.label)).reduce((a, b) => a + b.count, 0)
  }
}

export async function aggregateMeetingsSummary(companyIds: string[], start: Date, end: Date) {
  const [byStatus, inPeriod] = await Promise.all([
    db.meeting.groupBy({ by: ['status'], where: { companyId: { in: companyIds }, createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
    db.meeting.count({ where: { companyId: { in: companyIds }, createdAt: { gte: start, lt: end } } })
  ])
  return { total: inPeriod, byStatus: toMap(byStatus, 'status') }
}
