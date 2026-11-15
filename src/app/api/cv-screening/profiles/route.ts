// src/app/api/cv-screening/profiles/route.ts
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveCvScreeningCompanyId } from '@/app/lib/cv-screening/companyScope'
import { createScreeningProfile, listScreeningProfiles, ProfileValidationError } from '@/app/lib/cv-screening/profiles'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const searchParams = request.nextUrl.searchParams
    const scope = await resolveCvScreeningCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const status = searchParams.get('status') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))
    const { profiles, total } = await listScreeningProfiles(scope.companyId as string, status, { page, pageSize })

    return withCors(
      ApiResponse.success({ profiles, pagination: { page, pageSize, total } }, 'Screening profiles retrieved'),
      origin
    )
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await request.json()
    const scope = await resolveCvScreeningCompanyId(user, body?.companyId)
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const profile = await createScreeningProfile({
      companyId: scope.companyId as string,
      name: body?.name,
      description: body?.description,
      criteria: body?.criteria,
      defaultAiService: body?.defaultAiService,
      defaultAiModel: body?.defaultAiModel,
      defaultStrictness: body?.defaultStrictness,
      createdBy: user.userId || 'system',
    })

    return withCors(ApiResponse.success({ profile }, 'Screening profile created', 201), origin)
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return withCors(ApiResponse.error(error.message, 400), origin)
    }
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
