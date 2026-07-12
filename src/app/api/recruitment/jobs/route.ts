// src/app/api/jobs/route.ts
//admin,SUPER_ADMIN or HR view only
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN','SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)

    // Honour the global company switcher (companyId param) with per-role access,
    // so a multi-company ADMIN/SUPER_ADMIN sees jobs for the selected company.
    const scope = await resolveRecruitmentCompanyId(user, searchParams.get('companyId'))
    if (scope.error) {
      return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    }
    const companyId = scope.companyId as string

    const status = searchParams.get('status') // optional filter
    const take = Number(searchParams.get('take') || '50')
    const skip = Number(searchParams.get('skip') || '0')

    const where: any = {
      companyId,
      company: { archived: 0 },
    }
    if (status) where.status = status

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.job.count({ where }),
    ])

    return withCors(
      ApiResponse.success(
        {
          total,
          take,
          skip,
          jobs,
        },
        'Jobs fetched successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
