import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

const ALLOWED_STATUSES = ['NOT_CONTACTED', 'CONTACTED', 'REJECTED_USAGE', 'USING_APP_NOW']

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/super-admin/demo-requests/summary
// Status-funnel counts for the dashboard's Sales Pipeline widget.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['SUPER_ADMIN'])

    const grouped = await (prisma as any).demoRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    })

    const counts: Record<string, number> = Object.fromEntries(ALLOWED_STATUSES.map((s) => [s, 0]))
    let total = 0
    for (const row of grouped) {
      if (ALLOWED_STATUSES.includes(row.status)) counts[row.status] = row._count._all
      total += row._count._all
    }

    return withCors(ApiResponse.success({ counts, total }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
