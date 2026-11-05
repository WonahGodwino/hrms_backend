// src/app/api/payroll/reports/statutory-schedule/route.ts
//
// NSITF / ITF / NHF schedule for ONE payroll (uploaded or generated): the
// Finance Report statutory tab's per-run view. Excel twin: ./download.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies } from '@/app/lib/reporting/access'
import { buildStatutorySchedule } from '@/app/lib/payroll/reports/statutory-schedule'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }
    const accessibleIds = accessibleCompanies.map((c) => c.companyId)
    const sourceType = (searchParams.get('sourceType') || '').toLowerCase()
    const sourceId = searchParams.get('sourceId')
    if (sourceType !== 'upload' && sourceType !== 'generated') {
      return withCors(ApiResponse.error('sourceType must be "upload" or "generated"', 400), origin)
    }
    if (!sourceId) {
      return withCors(ApiResponse.error('sourceId is required', 400), origin)
    }

    const schedule = await buildStatutorySchedule(sourceType, sourceId, accessibleIds)
    if (!schedule) {
      return withCors(ApiResponse.error('Payroll source not found or not accessible', 404), origin)
    }
    return withCors(ApiResponse.success(schedule, 'Statutory schedule retrieved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
