import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { listReviews } from '@/app/lib/trial/review'

const STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'BANNED']

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// Held / flagged self sign-up trials awaiting a Super_Admin decision.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 10)))
    const status = String(searchParams.get('status') || '').trim().toUpperCase()

    const { total, rows } = await listReviews({ status: STATUSES.includes(status) ? status : undefined, page, pageSize })
    const items = rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyName: r.company.companyName,
      rcNumber: r.company.rcNumber,
      email: r.company.email,
      trialStatus: r.company.trialStatus,
      score: r.score,
      kind: r.kind,
      status: r.status,
      decision: r.decision,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
    }))
    return withCors(
      ApiResponse.success({ items, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
