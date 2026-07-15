// GET /api/recruitment/offers — list all offers (paginated, filterable)
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
    const queryCompanyId = searchParams.get('companyId')
    const companyId = queryCompanyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const search = searchParams.get('search')
    const status = searchParams.get('status')
    // Tab scope: 'pending' = not yet dispatched, 'dispatched' = letter sent (and beyond).
    const scope = (searchParams.get('scope') || '').toLowerCase()
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

    const PENDING_STATES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED']
    const DISPATCHED_STATES = ['AWAITING_SIGNATURE', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN']

    // Tab scopes: approval (not yet approved), ready (approved, awaiting dispatch),
    // dispatched (letter sent onward).
    const APPROVAL_STATES = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED']
    const READY_STATES = ['APPROVED']

    const where: any = { companyId, archived: 0 }
    if (status && [...PENDING_STATES, ...DISPATCHED_STATES, 'REJECTED'].includes(status)) where.status = status
    else if (scope === 'approval') where.status = { in: APPROVAL_STATES }
    else if (scope === 'ready' || scope === 'pending') where.status = { in: READY_STATES }
    else if (scope === 'dispatched') where.status = { in: DISPATCHED_STATES }

    const [total, offers] = await Promise.all([
      prisma.offer.count({ where }),
      prisma.offer.findMany({
        where,
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          application: { select: { job: { select: { title: true, department: true } } } },
          approvals: { orderBy: { step: 'asc' } },
        },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
    ])

    // Which of these offers already have an onboarding started (so the UI can
    // show "Start Onboarding" vs "Onboarding started").
    const offerIds = offers.map((o) => o.id)
    const onboardings = offerIds.length
      ? await prisma.onboarding.findMany({
          where: { offerId: { in: offerIds }, archived: 0 },
          select: { id: true, offerId: true, status: true },
        })
      : []
    const onboardingByOffer = new Map(onboardings.map((ob) => [ob.offerId, ob]))

    const fmt = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)
    const data = offers.map(o => {
      const meta: any = (o.metadata && typeof o.metadata === 'object') ? o.metadata : {}
      const ob = onboardingByOffer.get(o.id)

      // Comprehensive approval summary (who approves, their decision + when).
      const steps = (o as any).approvals || []
      const approvers = steps.map((s: any) => ({
        userId: s.approverId,
        name: s.approverName || 'Approver',
        role: s.approverRole || null,
        status: s.status,
        actedAt: fmt(s.actedAt),
      }))
      const approvedSteps = steps.filter((s: any) => s.status === 'APPROVED')
      const pendingStep = steps.find((s: any) => s.status === 'PENDING')
      const lastApproved = approvedSteps.length
        ? approvedSteps.reduce((a: any, b: any) => (new Date(a.actedAt || 0) > new Date(b.actedAt || 0) ? a : b))
        : null
      const approval = {
        assigned: steps.length > 0,
        routingMode: o.routingMode || null,
        approvers,
        pendingApproverId: pendingStep?.approverId || null,
        pendingApproverName: pendingStep?.approverName || null,
        approvedByName: o.status === 'APPROVED'
          ? (lastApproved?.approverName || null)
          : null,
        approvedAt: o.status === 'APPROVED' ? fmt(lastApproved?.actedAt) : null,
        rejectionReason: o.rejectionReason || null,
      }

      return {
        id: o.id,
        candidate: {
          id: o.candidate.id,
          name: `${o.candidate.firstName} ${o.candidate.lastName}`.trim(),
          email: o.candidate.email || null,
        },
        role: o.application.job?.title || 'Unknown',
        department: o.application.job?.department || '',
        baseSalary: o.salary ? Number(o.salary) : 0,
        currency: o.currency || 'NGN',
        status: o.status,
        gradeName: o.gradeName || null,
        dispatched: DISPATCHED_STATES.includes(o.status) || !!o.dispatchedAt,
        dispatchedAt: o.dispatchedAt ? o.dispatchedAt.toISOString() : null,
        responseDeadline: meta.responseDeadline || null,
        proposedStartDate: o.proposedStartDate ? o.proposedStartDate.toISOString() : null,
        approval,
        onboardingId: ob?.id || null,
        onboardingStatus: ob?.status || null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      }
    })

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }, 'Success', 200), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
