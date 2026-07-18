// POST /api/recruitment/onboarding/documents/:docId/reject
// Marks a candidate's uploaded document as REJECTED so the candidate can
// re-upload a corrected version. The rejection reason is stored and surfaced
// to the candidate.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { docId } = await params
    const body = await request.json().catch(() => ({}))
    const companyId = body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const reason = String(body.reason || '').trim()
    if (!reason) return withCors(ApiResponse.error('A rejection reason is required.', 400), origin)

    const doc = await (prisma as any).candidateDocument.findFirst({
      where: { id: docId, companyId, archived: 0 },
    })
    if (!doc) return withCors(ApiResponse.error('Document not found', 404), origin)

    const now = new Date()
    await (prisma as any).candidateDocument.update({
      where: { id: docId },
      data: {
        reviewStatus: 'REJECTED',
        reviewedBy: user.userId,
        reviewedAt: now,
        rejectionReason: reason,
      },
    })

    return withCors(ApiResponse.success(
      { id: docId, reviewStatus: 'REJECTED', rejectionReason: reason },
      'Document rejected. The candidate will be notified to re-upload.',
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
