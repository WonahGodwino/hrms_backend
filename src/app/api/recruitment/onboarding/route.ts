// GET /api/recruitment/onboarding — list onboardings (paginated, filterable)
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { REQUIRED_CATEGORIES } from '@/app/lib/offers/candidate-documents'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const status = searchParams.get('status')
    const search = (searchParams.get('search') || '').trim()
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

    const where: any = { companyId, archived: 0 }
    if (status) where.status = status
    if (search) {
      where.application = {
        OR: [
          { candidate: { firstName: { contains: search, mode: 'insensitive' } } },
          { candidate: { lastName: { contains: search, mode: 'insensitive' } } },
          { candidate: { email: { contains: search, mode: 'insensitive' } } },
          { job: { title: { contains: search, mode: 'insensitive' } } },
        ],
      }
    }

    const [total, rows] = await Promise.all([
      prisma.onboarding.count({ where }),
      prisma.onboarding.findMany({
        where,
        include: {
          application: {
            include: {
              candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
              job: { select: { title: true, department: true } },
            },
          },
          offer: { select: { metadata: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    // Document-upload progress for hires already promoted to staff.
    const REQUIRED_DOCS = ['MEANS_OF_ID', 'GUARANTOR_FORM', 'SIGNED_OFFER']
    const staffIds = rows.map((o) => o.staffRecordId).filter(Boolean) as string[]
    const progressByStaff: Record<string, number> = {}
    if (staffIds.length) {
      const docs = await (prisma as any).staffOnboardingDocument.findMany({
        where: { staffId: { in: staffIds } },
        select: { staffId: true, category: true },
      })
      const byStaff: Record<string, Set<string>> = {}
      for (const d of docs) {
        ;(byStaff[d.staffId] ||= new Set()).add(d.category)
      }
      for (const sid of staffIds) {
        const have = byStaff[sid] || new Set()
        const uploaded = REQUIRED_DOCS.filter((c) => have.has(c)).length
        progressByStaff[sid] = Math.round((uploaded / REQUIRED_DOCS.length) * 100)
      }
    }

    // Pre-promotion: document progress from what the candidate uploaded via their
    // offer link (candidate_documents), keyed by candidate.
    const candidateIds = rows
      .filter((o) => !o.staffRecordId)
      .map((o) => (o.application as any)?.candidateId)
      .filter(Boolean) as string[]
    const candDocsByCandidate: Record<string, any[]> = {}
    if (candidateIds.length) {
      const cds = await (prisma as any).candidateDocument.findMany({
        where: { candidateId: { in: candidateIds }, category: { in: REQUIRED_CATEGORIES }, archived: 0 },
        select: { id: true, candidateId: true, category: true, fileName: true, filePath: true, reviewStatus: true, rejectionReason: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
      for (const d of cds) (candDocsByCandidate[d.candidateId] ||= []).push(d)
    }

    // Blocking-issue signal: open (non-DONE) checklist tasks per onboarding,
    // split into overdue/blocked ("critical") vs. still-on-schedule ("pending").
    // Also doubles as the source for checklist completion % (done/total) so the
    // command-center progress bar tracks the same number as the checklist view
    // (OnboardingChecklist.jsx's progressData) instead of drifting from it.
    const onboardingIds = rows.map((o) => o.id)
    const issuesByOnboarding: Record<string, { pendingCount: number; criticalCount: number; sample: string | null; criticalSample: string | null }> = {}
    const taskProgressByOnboarding: Record<string, { total: number; done: number }> = {}
    if (onboardingIds.length) {
      const now = new Date()
      const allTasks = await prisma.onboardingTask.findMany({
        where: { onboardingId: { in: onboardingIds }, archived: 0 },
        select: { onboardingId: true, status: true, dueDate: true, title: true },
      })
      for (const t of allTasks) {
        const progress = (taskProgressByOnboarding[t.onboardingId] ||= { total: 0, done: 0 })
        progress.total += 1
        if (t.status === 'DONE') {
          progress.done += 1
          continue
        }
        const bucket = (issuesByOnboarding[t.onboardingId] ||= { pendingCount: 0, criticalCount: 0, sample: null, criticalSample: null })
        const isCritical = t.status === 'BLOCKED' || (!!t.dueDate && t.dueDate < now)
        if (isCritical) {
          bucket.criticalCount += 1
          if (!bucket.criticalSample) bucket.criticalSample = t.title
        } else {
          bucket.pendingCount += 1
          if (!bucket.sample) bucket.sample = t.title
        }
      }
    }

    const data = rows.map((o) => {
      const c = (o.application as any)?.candidate
      const appMeta = ((o.application as any)?.metadata && typeof (o.application as any).metadata === 'object')
        ? (o.application as any).metadata : {}
      const offerMeta = ((o.offer as any)?.metadata && typeof (o.offer as any).metadata === 'object')
        ? (o.offer as any).metadata : {}
      const onboardingMeta = (o.metadata && typeof o.metadata === 'object') ? (o.metadata as any) : {}
      const handoff = (onboardingMeta.handoff && typeof onboardingMeta.handoff === 'object') ? onboardingMeta.handoff : {}
      // Pre-promotion document progress + list (candidate uploads). Tracks
      // APPROVED categories, not merely uploaded ones: otherwise this hits
      // 100% the instant a candidate submits all docs and never moves again
      // as HR works through the review queue approving/rejecting them.
      const cid = (o.application as any)?.candidateId
      const candDocs = (!o.staffRecordId && cid) ? (candDocsByCandidate[cid] || []) : []
      const approvedCats = new Set(candDocs.filter((d) => d.reviewStatus === 'APPROVED').map((d) => d.category))
      const candidateDocProgress = !o.staffRecordId
        ? Math.round(([...approvedCats].filter((c2) => REQUIRED_CATEGORIES.includes(c2 as string)).length / REQUIRED_CATEGORIES.length) * 100)
        : null
      const issues = issuesByOnboarding[o.id]
      const isCritical = (issues?.criticalCount ?? 0) > 0
      const issueCount = isCritical ? (issues?.criticalCount ?? 0) : (issues?.pendingCount ?? 0)
      const issue = isCritical ? issues?.criticalSample ?? null : issues?.sample ?? null
      // Once a checklist exists for this hire, it's the real progress signal
      // (what OnboardingChecklist.jsx shows and what HR actually clicks through
      // task-by-task): prefer it over the document-upload/review percentage,
      // which only applies pre-checklist.
      const taskProgress = taskProgressByOnboarding[o.id]
      const checklistProgress = taskProgress && taskProgress.total > 0
        ? Math.round((taskProgress.done / taskProgress.total) * 100)
        : null
      return {
        id: o.id,
        offerId: o.offerId,
        candidate: c ? { id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email } : null,
        candidateDocuments: candDocs.map((d) => ({
          id: d.id,
          category: d.category,
          fileName: d.fileName,
          url: d.filePath,
          reviewStatus: d.reviewStatus || 'PENDING',
          rejectionReason: d.rejectionReason || null,
          uploadedAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        })),
        role: handoff.jobTitle || (o.application as any)?.job?.title || 'Unknown',
        department: handoff.department || (o.application as any)?.job?.department || '',
        manager: handoff.managerName || '',
        managerId: handoff.managerId || '',
        appliedTemplateNames: Array.isArray(handoff.appliedTemplateNames) ? handoff.appliedTemplateNames : [],
        status: o.status,
        isExternalHire: appMeta.source === 'EXTERNAL_HIRE' || offerMeta.source === 'EXTERNAL_HIRE',
        staffId: offerMeta.staffId || '',
        staffRecordId: o.staffRecordId || null,
        handbookAcknowledged: !!o.handbookAcknowledgedAt,
        candidateAgreed: !!o.candidateAgreedAt,
        documentProgress: checklistProgress != null
          ? checklistProgress
          : (o.staffRecordId ? (progressByStaff[o.staffRecordId] ?? 0) : candidateDocProgress),
        isCritical,
        issueCount,
        issue,
        startDate: o.startDate ? o.startDate.toISOString() : null,
        completedAt: o.completedAt ? o.completedAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
      }
    })

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
