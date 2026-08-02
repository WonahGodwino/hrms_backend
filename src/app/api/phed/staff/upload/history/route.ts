import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/staff/upload/history?companyId=xxx&page=1&limit=20
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const p         = new URL(req.url).searchParams
    const companyId = p.get('companyId')
    const page      = Math.max(1, Number(p.get('page') || 1))
    const limit     = Math.min(50, Math.max(1, Number(p.get('limit') || 20)))

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const where = { companyId, type: 'STAFF' as const }

    const [total, uploads] = await Promise.all([
      (prisma as any).phedBulkUpload.count({ where }),
      (prisma as any).phedBulkUpload.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
    ])

    const history = uploads.map((u: any) => ({
      id: u.id,
      fileName: u.fileName,
      totalRecords: u.totalRecords,
      successful: u.successful,
      failed: u.failed,
      errorCount: Array.isArray(u.errors) ? u.errors.length : 0,
      createdAt: u.createdAt,
    }))

    return withCors(ApiResponse.success({ history, total, page, limit, pages: Math.ceil(total / limit) }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
