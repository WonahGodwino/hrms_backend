// GET /api/recruitment/offers/:id — offer detail with compensation, approval history, documents
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        application: { select: { job: { select: { title: true, department: true } } } },
        approvals: {
          orderBy: { step: 'asc' },
          select: { approverId: true, approverName: true, approverRole: true, status: true, notes: true, actedAt: true, step: true },
        },
      },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    return withCors(ApiResponse.success({
      id: offer.id,
      status: offer.status,
      compensation: {
        grade: offer.gradeName || '',
        step: offer.step || '',
        baseSalary: offer.salary ? Number(offer.salary) : 0,
        bonusPercentage: offer.bonusPercentage || 0,
        hmoTier: offer.hmoTier || '',
        stockOptions: offer.stockOptions || 0,
        signOnBonus: offer.signOnBonus ? Number(offer.signOnBonus) : 0,
        relocationAllowance: offer.relocationAllowance ? Number(offer.relocationAllowance) : 0,
      },
      anticipatedStartDate: offer.proposedStartDate?.toISOString() || null,
      documents: {
        draftPdf: offer.draftPdfPath || null,
        executedPdf: offer.executedPdfPath || null,
      },
      sentAt: offer.sentAt?.toISOString() || null,
      dispatchedAt: offer.dispatchedAt?.toISOString() || null,
      approvalHistory: offer.approvals.map(s => ({
        userId: s.approverId,
        name: s.approverName || '',
        role: s.approverRole,
        status: s.status,
        notes: s.notes,
        actedAt: s.actedAt?.toISOString() || null,
      })),
    }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
