// GET /api/exports/{id}: status of a file being prepared in the background (PERF-003).
// Only the person who asked for the file can see it; anyone else gets 404.
import { NextRequest } from 'next/server'
import { requireAuth } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readExportRecord } from '@/app/lib/exports/store'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const user = requireAuth(request.headers.get('authorization')?.replace('Bearer ', '') ?? null)
    const { id } = await props.params
    const record = await readExportRecord(id)
    if (!record || record.userId !== user.userId) return withCors(ApiResponse.notFound('Export not found or expired'), origin)
    return withCors(ApiResponse.success({
      exportId: record.id,
      status: record.status,
      fileName: record.fileName ?? null,
      size: record.size ?? null,
      message: record.message ?? null,
      createdAt: record.createdAt,
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error, request), origin)
  }
}
