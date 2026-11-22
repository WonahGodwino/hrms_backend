// /api/admin/s3-migration — SUPER_ADMIN only.
//   GET    → latest migration job + per-section progress.
//   POST   → start a new background migration run (server-side, fire-and-forget).
//   DELETE → cancel the running migration.
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import {
  cancelMigration,
  getLatestMigration,
  startS3Migration,
} from '@/app/lib/migrations/s3-migration'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

function requireSuperAdmin(request: NextRequest): { userId: string; role: string; email: string } {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) throw Object.assign(new Error('Authorization header missing'), { status: 401 })
  return requireRole(token, ['SUPER_ADMIN']) as { userId: string; role: string; email: string }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    requireSuperAdmin(request)
    const job = await getLatestMigration()
    return withCors(ApiResponse.success(job), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const user = requireSuperAdmin(request)
    const job = await startS3Migration(user.userId)
    return withCors(ApiResponse.success(job, 'Migration started', 201), origin)
  } catch (error: any) {
    const message = error?.message || 'Failed to start migration'
    const status = /already running/i.test(message) ? 409 : /not configured/i.test(message) ? 400 : (error?.status || 500)
    return withCors(ApiResponse.error(message, status), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    requireSuperAdmin(request)
    const { jobId } = await request.json().catch(() => ({ jobId: undefined }))
    if (!jobId) return withCors(ApiResponse.error('jobId is required', 400), origin)
    const job = await cancelMigration(jobId)
    return withCors(ApiResponse.success(job, 'Migration cancelled'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
