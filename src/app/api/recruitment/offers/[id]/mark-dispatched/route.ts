// POST /api/recruitment/offers/:id/mark-dispatched
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json().catch(() => ({}))
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || body.companyId

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const offer = await prisma.offer.findFirst({ where })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)
    if (offer.status !== 'APPROVED') {
      return withCors(ApiResponse.error('Only approved offers can be dispatched. Current status: ' + offer.status, 400), origin)
    }

    // Validate required company offer letter settings before dispatch
    const company = await prisma.company.findUnique({
      where: { id: offer.companyId },
      select: { hrRepName: true, hrRepTitle: true, offerResponseDays: true, communicationTool: true },
    })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    const missing: string[] = []
    if (!company.hrRepName) missing.push('HR Representative (hrRepName)')
    if (!company.hrRepTitle) missing.push('HR Representative Title (hrRepTitle)')
    if (!company.communicationTool) missing.push('Communication Tool (communicationTool)')
    const responseDays = company.offerResponseDays ?? 14
    if (missing.length > 0) {
      return withCors(ApiResponse.error(
        `Cannot dispatch offer. Configure these company settings first: ${missing.join(', ')}. Go to Offer Letter Settings.`,
        400,
      ), origin)
    }

    await prisma.offer.update({
      where: { id: params.id },
      data: { status: 'AWAITING_SIGNATURE', dispatchedAt: new Date() },
    })

    return withCors(ApiResponse.success({
      offerId: offer.id, status: 'AWAITING_SIGNATURE',
    }, 'Offer marked as dispatched.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
