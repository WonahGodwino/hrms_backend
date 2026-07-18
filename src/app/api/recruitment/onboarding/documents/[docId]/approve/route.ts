// POST /api/recruitment/onboarding/documents/:docId/approve
// Marks a candidate's uploaded document as APPROVED so HR can track which
// documents have been reviewed and cleared. Once all required documents are
// approved, the onboarding can be completed and the candidate promoted to
// a staff record.
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

    const doc = await (prisma as any).candidateDocument.findFirst({
      where: { id: docId, companyId, archived: 0 },
    })
    if (!doc) return withCors(ApiResponse.error('Document not found', 404), origin)
    if (doc.reviewStatus === 'APPROVED') {
      return withCors(ApiResponse.success({ id: docId, reviewStatus: 'APPROVED' }, 'Document was already approved.'), origin)
    }

    const now = new Date()
    await (prisma as any).candidateDocument.update({
      where: { id: docId },
      data: {
        reviewStatus: 'APPROVED',
        reviewedBy: user.userId,
        reviewedAt: now,
        rejectionReason: null,
      },
    })

    return withCors(ApiResponse.success(
      { id: docId, reviewStatus: 'APPROVED', reviewedBy: user.userId, reviewedAt: now.toISOString() },
      'Document approved.',
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
