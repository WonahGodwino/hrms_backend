// src/app/api/cv-screening/profiles/[id]/route.ts
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveCvScreeningCompanyId } from '@/app/lib/cv-screening/companyScope'
import { getScreeningProfile, updateScreeningProfile, archiveScreeningProfile, ProfileValidationError } from '@/app/lib/cv-screening/profiles'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const scope = await resolveCvScreeningCompanyId(user, request.nextUrl.searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const profile = await getScreeningProfile(id, scope.companyId as string)
    if (!profile) return withCors(ApiResponse.error('Profile not found', 404), origin)

    return withCors(ApiResponse.success({ profile }, 'Screening profile retrieved'), origin)
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const body = await request.json()
    const scope = await resolveCvScreeningCompanyId(user, body?.companyId)
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const profile = await updateScreeningProfile(id, scope.companyId as string, {
      name: body?.name,
      description: body?.description,
      criteria: body?.criteria,
      defaultAiService: body?.defaultAiService,
      defaultAiModel: body?.defaultAiModel,
      defaultStrictness: body?.defaultStrictness,
      updatedBy: user.userId || 'system',
    })

    return withCors(ApiResponse.success({ profile }, 'Screening profile updated'), origin)
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return withCors(ApiResponse.error(error.message, error.message === 'Profile not found' ? 404 : 400), origin)
    }
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const scope = await resolveCvScreeningCompanyId(user, request.nextUrl.searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const profile = await archiveScreeningProfile(id, scope.companyId as string, user.userId || 'system')

    return withCors(ApiResponse.success({ profile }, 'Screening profile archived'), origin)
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return withCors(ApiResponse.error(error.message, error.message === 'Profile not found' ? 404 : 400), origin)
    }
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
