// GET /api/recruitment/onboarding — list onboardings (paginated, filterable)
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

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

    const data = rows.map((o) => {
      const c = o.offer?.candidate
      const appMeta = ((o.offer as any)?.application?.metadata && typeof (o.offer as any).application.metadata === 'object')
        ? (o.offer as any).application.metadata : {}
      const offerMeta = ((o.offer as any)?.metadata && typeof (o.offer as any).metadata === 'object')
        ? (o.offer as any).metadata : {}
      const handoff = (offerMeta.handoff && typeof offerMeta.handoff === 'object') ? offerMeta.handoff : {}
      return {
        id: o.id,
        offerId: o.offerId,
        candidate: c ? { id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email } : null,
        role: handoff.jobTitle || (o.offer as any)?.application?.job?.title || 'Unknown',
        department: handoff.department || (o.offer as any)?.application?.job?.department || '',
        manager: handoff.managerName || '',
        managerId: handoff.managerId || '',
        status: o.status,
        isExternalHire: appMeta.source === 'EXTERNAL_HIRE' || offerMeta.source === 'EXTERNAL_HIRE',
        staffId: offerMeta.staffId || '',
        staffRecordId: o.staffRecordId || null,
        documentProgress: o.staffRecordId ? (progressByStaff[o.staffRecordId] ?? 0) : null,
        startDate: o.startDate ? o.startDate.toISOString() : null,
        completedAt: o.completedAt ? o.completedAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
      }
    })

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
