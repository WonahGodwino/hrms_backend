// GET /api/meetings/recordings/storage?companyId=…
// Returns the company's recording storage quota + current usage, so the
// Meetings dashboard can show users how much recording space they have left.
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { hasModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import {
  recordingStorageLimitBytes,
  recordingStorageUsedBytes,
} from '@/app/lib/meetings/recording-retention'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { searchParams } = new URL(req.url)

    const scope = await resolveScopedCompanyId(user, searchParams.get('companyId'))
    if (scope.forbidden) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    if (!scope.companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const canUseMeetings = await hasModuleAccess(scope.companyId, 'MEETINGS')
    if (!canUseMeetings) return withCors(ApiResponse.error('This module is not available for your organisation', 403), origin)

    const [limitBytes, usedBytes] = await Promise.all([
      recordingStorageLimitBytes(),
      recordingStorageUsedBytes(scope.companyId),
    ])

    return withCors(ApiResponse.success({
      limitBytes,
      usedBytes,
      limitMb: Math.round(limitBytes / 1024 / 1024),
      usedMb: Math.round(usedBytes / 1024 / 1024),
      remainingBytes: Math.max(0, limitBytes - usedBytes),
    }, 'Recording storage usage'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
