// GET /api/recruitment/offers/:id/context
// Returns the requisition context the Offer Builder needs: the candidate/job,
// the grade's real step ladder + pay, the benefit catalog, and the offer's
// current builder values. Read-only.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const money = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(req.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const offer = await prisma.offer.findFirst({
      where: { id, companyId },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true, locationState: true } },
        application: { select: { job: { select: { id: true, title: true, department: true, description: true } } } },
        company: { select: { companyName: true, tradingName: true } },
      },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}
    const extra = (offer.additionalBenefits && typeof offer.additionalBenefits === 'object') ? offer.additionalBenefits as any : {}
    const job = (offer as any).application?.job || null
    const jobDefaults = (job?.offerDefaults && typeof job.offerDefaults === 'object') ? job.offerDefaults : {}

    // Grade + step ladder (real pay per step).
    let grade: any = null
    if (offer.gradeId) {
      grade = await (prisma as any).gradeLevel.findFirst({
        where: { id: offer.gradeId },
        include: { steps: { orderBy: { stepNumber: 'asc' } }, benefits: { select: { id: true } } },
      })
    }

    const steps = (grade?.steps || []).map((s: any) => {
      const basePay = s.calculatedPay ?? (grade?.basePay ? grade.basePay * (1 + (s.incrementPercent || 0) / 100) : 0)
      return { id: s.stepNumber, label: `Step ${s.stepNumber}: ${money(basePay)} / yr`, basePay: Math.round(basePay) }
    })
    const maxApprovedStep = jobDefaults.maxApprovedStep ?? grade?.totalSteps ?? null

    // Benefit catalog from the benefits module, scoped to this offer's job:
    // job-specific benefits plus the all-roles (jobId = null) ones.
    const offerJobId = (offer as any).jobId || job?.id || null
    const benefitWhere: any = { companyId, isActive: true, OR: [{ jobId: null }] }
    if (offerJobId) benefitWhere.OR.push({ jobId: offerJobId })
    const policies = await (prisma as any).benefitPolicy.findMany({
      where: benefitWhere,
      select: { id: true, name: true, category: true, jobId: true },
      orderBy: { name: 'asc' },
    })
    const selectedIds = new Set<string>(Array.isArray(extra.benefitIds) ? extra.benefitIds : [])
    const benefits = policies.map((p: any) => ({
      id: p.id,
      label: p.name,
      category: p.category,
      jobScoped: !!p.jobId,
      isDefault: selectedIds.has(p.id),
    }))

    return withCors(ApiResponse.success({
      company: {
        name: (offer as any).company?.tradingName || (offer as any).company?.companyName || '',
      },
      candidate: {
        id: offer.candidate?.id,
        name: `${offer.candidate?.firstName || ''} ${offer.candidate?.lastName || ''}`.trim(),
        email: offer.candidate?.email || null,
        residentialState: offer.candidate?.locationState || null,
      },
      job: job ? { id: job.id, title: job.title, department: job.department, description: job.description } : null,
      grade: {
        id: offer.gradeId || null,
        name: grade?.name || offer.gradeName || null,
        maxApprovedStep,
        steps,
      },
      benefits,
      customComponentTypes: ['Relocation Allowance', 'Sign-on Bonus', 'Education Stipend', 'Retention Bonus', 'Other'],
      offer: {
        configMode: meta.configMode || 'TEMPLATE',
        status: offer.status,
        step: offer.step ?? (steps[0]?.id ?? 1),
        baseSalary: offer.salary ? Number(offer.salary) : (steps[0]?.basePay ?? 0),
        benefitIds: Array.isArray(extra.benefitIds) ? extra.benefitIds : [],
        customComponents: Array.isArray(extra.customComponents) ? extra.customComponents : [],
        equityGrant: extra.equityGrant ?? '',
        offerIntro: meta.offerIntro ?? '',
        offerLegal: meta.offerLegal ?? '',
        anticipatedStartDate: offer.proposedStartDate ? offer.proposedStartDate.toISOString().slice(0, 10) : null,
        offerExpirationDate: meta.offerExpirationDate || null,
      },
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
