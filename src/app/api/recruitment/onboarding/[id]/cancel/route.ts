// POST /api/recruitment/onboarding/:id/cancel
// Cancels an in-progress onboarding (e.g. the hire fell through). Blocked once the
// onboarding has been completed (the person is already in staff_records).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const onboarding = await prisma.onboarding.findFirst({ where: { id, companyId } })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)
    if (onboarding.status === 'COMPLETED') {
      return withCors(ApiResponse.error('This onboarding is already completed and cannot be cancelled', 409), origin)
    }
    if (onboarding.status === 'CANCELLED') {
      return withCors(ApiResponse.success({ id, status: 'CANCELLED' }, 'Onboarding already cancelled.'), origin)
    }

    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    await prisma.onboarding.update({
      where: { id },
      data: { status: 'CANCELLED', updatedBy: actor },
    })

    // Reflect the outcome on the linked offer's metadata for auditability.
    if (reason && onboarding.offerId) {
      const offer = await prisma.offer.findUnique({ where: { id: onboarding.offerId }, select: { metadata: true } }).catch(() => null)
      if (offer) {
        const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}
        await prisma.offer.update({
          where: { id: onboarding.offerId },
          data: { metadata: { ...meta, onboardingCancelReason: reason } as any },
        }).catch(() => {})
      }
    }

    return withCors(ApiResponse.success({ id, status: 'CANCELLED' }, 'Onboarding cancelled.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
