// /api/admin/s3-migration — SUPER_ADMIN only.
//   GET    → latest migration job + per-section progress.
//   POST   → start a new migration run on the background job queue (runs inline when the queue is off).
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
import { S3MigrationError } from '@/app/lib/migrations/s3-migration-types'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { cancelS3MigrationSchema } from '@/app/lib/validation/s3-migration-schemas'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/** A refusal from the runner keeps its own status and message; anything else is a generic error. */
function errorResponse(error: unknown, request: NextRequest) {
  if (error instanceof S3MigrationError) return ApiResponse.error(error.message, error.status)
  return handleApiError(error, request)
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
    return withCors(handleApiError(error, request), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const user = requireSuperAdmin(request)
    const job = await startS3Migration(user.userId)
    return withCors(ApiResponse.success(job, 'Migration started', 201), origin)
  } catch (error) {
    return withCors(errorResponse(error, request), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    requireSuperAdmin(request)
    const body = await readJsonBody(request, cancelS3MigrationSchema)
    if (!body.ok) return withCors(ApiResponse.error(body.message, 400), origin)
    const job = await cancelMigration(body.data.jobId)
    return withCors(ApiResponse.success(job, 'Migration cancelled'), origin)
  } catch (error) {
    return withCors(errorResponse(error, request), origin)
  }
}
