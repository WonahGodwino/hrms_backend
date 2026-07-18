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
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

    const where: any = { companyId, archived: 0 }
    if (status) where.status = status

    const [total, rows] = await Promise.all([
      prisma.onboarding.count({ where }),
      prisma.onboarding.findMany({
        where,
        include: {
          offer: {
            include: {
              candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
              application: { select: { job: { select: { title: true, department: true } }, metadata: true } },
            },
          },
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
      .map((o) => (o.offer as any)?.candidateId)
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

    const data = rows.map((o) => {
      const c = o.offer?.candidate
      const appMeta = ((o.offer as any)?.application?.metadata && typeof (o.offer as any).application.metadata === 'object')
        ? (o.offer as any).application.metadata : {}
      const offerMeta = ((o.offer as any)?.metadata && typeof (o.offer as any).metadata === 'object')
        ? (o.offer as any).metadata : {}
      const handoff = (offerMeta.handoff && typeof offerMeta.handoff === 'object') ? offerMeta.handoff : {}
      // Pre-promotion document progress + list (candidate uploads).
      const cid = (o.offer as any)?.candidateId
      const candDocs = (!o.staffRecordId && cid) ? (candDocsByCandidate[cid] || []) : []
      const uniqueCats = new Set(candDocs.map((d) => d.category))
      const candidateDocProgress = !o.staffRecordId
        ? Math.round(([...uniqueCats].filter((c2) => REQUIRED_CATEGORIES.includes(c2 as string)).length / REQUIRED_CATEGORIES.length) * 100)
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
        role: handoff.jobTitle || (o.offer as any)?.application?.job?.title || 'Unknown',
        department: handoff.department || (o.offer as any)?.application?.job?.department || '',
        manager: handoff.managerName || '',
        managerId: handoff.managerId || '',
        status: o.status,
        isExternalHire: appMeta.source === 'EXTERNAL_HIRE' || offerMeta.source === 'EXTERNAL_HIRE',
        staffId: offerMeta.staffId || '',
        staffRecordId: o.staffRecordId || null,
        documentProgress: o.staffRecordId ? (progressByStaff[o.staffRecordId] ?? 0) : candidateDocProgress,
        startDate: o.startDate ? o.startDate.toISOString() : null,
        completedAt: o.completedAt ? o.completedAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
      }
    })

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
