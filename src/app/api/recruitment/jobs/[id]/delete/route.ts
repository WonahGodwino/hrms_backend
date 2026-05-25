// app/api/recruitment/jobs/[id]/delete/route.ts
import { NextRequest } from 'next/server'
import { archiveJobs } from '@/app/lib/jobs'
import type { UserContext } from '@/app/lib/jobs/types'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

type BulkArchiveBody = {
  id?: string
  jobId?: string
  ids?: string[]
  jobIds?: string[]
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function mapAuthErrorStatus(message: string): number {
  return message.toLowerCase().includes('insufficient permissions') ? 403 : 401
}

function sanitizeIds(ids: string[]): string[] {
  return [...new Set(ids.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean))]
}

function shouldUsePathId(pathId: string | undefined, body: BulkArchiveBody): boolean {
  if (!pathId) return false

  const normalized = pathId.trim().toLowerCase()
  if (!normalized) return false

  const placeholderSegments = new Set(['bulk', 'multiple', 'selected', 'delete', 'undefined', 'null'])
  if (placeholderSegments.has(normalized)) {
    return false
  }

  const bodyHasExplicitIds =
    typeof body.id === 'string' ||
    typeof body.jobId === 'string' ||
    (Array.isArray(body.ids) && body.ids.length > 0) ||
    (Array.isArray(body.jobIds) && body.jobIds.length > 0)

  if (bodyHasExplicitIds && pathId.includes(',')) {
    return false
  }

  return true
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')

  try {
    // Extract and validate token
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) {
      return withCors(ApiResponse.error('Invalid or missing Authorization header', 401), origin)
    }

    // Get user from token
    let user: UserContext
    try {
      const authUser = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
      const role = authUser.role
      if (role !== 'HR' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        throw new Error('Insufficient permissions')
      }
      user = {
        userId: authUser.userId,
        role,
        companyId: authUser.companyId
      }
    } catch (authError) {
      const message = formatError(authError)
      return withCors(ApiResponse.error(message, mapAuthErrorStatus(message)), origin)
    }

    // Parse request body for bulk operations
    let body: BulkArchiveBody = {}
    try {
      body = (await request.json()) as BulkArchiveBody
    } catch {
      body = {}
    }

    const requestedIds = sanitizeIds([
      ...(shouldUsePathId(params.id, body) ? [params.id] : []),
      ...(typeof body.id === 'string' ? [body.id] : []),
      ...(typeof body.jobId === 'string' ? [body.jobId] : []),
      ...(Array.isArray(body.ids) ? body.ids : []),
      ...(Array.isArray(body.jobIds) ? body.jobIds : []),
    ])

    if (requestedIds.length === 0) {
      return withCors(ApiResponse.error('At least one job id is required for deletion', 400), origin)
    }

    // Use the helper function to archive jobs
    const result = await archiveJobs(user, requestedIds)

    // Customize message based on role
    const message = user.role === 'SUPER_ADMIN'
      ? (result.archivedCount === 1
          ? `Job "${result.archivedJobTitles?.[0]}" archived successfully`
          : `${result.archivedCount} jobs archived successfully`)
      : (result.deletedCount === 1
          ? 'Job deleted successfully'
          : `${result.deletedCount} jobs deleted successfully`);

    return withCors(ApiResponse.success(result, message), origin)
    
  } catch (error) {
    const message = formatError(error)
    console.error('[JOB_DELETE] Error:', error)
    
    // Handle specific error messages
    if (message.includes('permission') || message.includes('Access denied')) {
      return withCors(ApiResponse.error(message, 403), origin)
    }
    if (message.includes('not found')) {
      return withCors(ApiResponse.error(message, 404), origin)
    }
    
    return withCors(ApiResponse.error(message, 500), origin)
  }
}