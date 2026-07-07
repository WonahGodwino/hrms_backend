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
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const offer = await prisma.offer.findFirst({ where })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    await prisma.offer.update({
      where: { id: params.id },
      data: { status: 'AWAITING_SIGNATURE', dispatchedAt: new Date() },
    })

    return withCors(ApiResponse.success({
      offerId: offer.id, status: 'AWAITING_SIGNATURE',
    }, 'Offer marked as dispatched.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
