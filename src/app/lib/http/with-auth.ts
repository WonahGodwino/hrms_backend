// Route wrapper for company-scoped API routes (ARCH-001).
//
// Replaces the boilerplate every route repeats by hand: read the token, check
// the role (and the module when given), work out the company, catch errors and
// add CORS headers. The handler gets a Prisma client already limited to that
// company (forCompany), so it cannot read or change another tenant's rows by
// forgetting a `where: { companyId }`.
//
//   export const GET = withAuth({ roles: ['HR', 'ADMIN'] }, async ({ db, params }) => {
//     const item = await db.phedFeeder.findFirst({ where: { id: params.id } })
//     return item ? ApiResponse.success(item) : ApiResponse.notFound('Not found')
//   })
//
// The company is the user's own, or `?companyId=` when the caller may access it
// (Super Admin, or a user linked to that company). See ADR-001.
import type { NextRequest, NextResponse } from 'next/server'
import type { AuthUser } from '@/app/lib/auth'
import { requireRoleAsync } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import type { ModuleKey } from '@/app/lib/modules'
import { canAccessCompany } from '@/app/lib/access/company-access'
import { withCors } from '@/app/lib/cors'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { forCompany, type CompanyDb } from '@/app/lib/data/tenant'
import { requestIdOf } from '@/app/lib/observability/request-id'

export type AuthedContext<P> = {
  request: NextRequest
  user: AuthUser
  params: P
  origin: string | null
  companyId: string
  /** Prisma client limited to `companyId`. */
  db: CompanyDb
  requestId?: string
}

export type WithAuthOptions = {
  roles: string[]
  /** Also require this module to be enabled for the company. */
  module?: ModuleKey
  /** Accept `?companyId=` for users who may access that company (default true). */
  companyFromQuery?: boolean
}

export function withAuth<P = Record<string, string>>(
  options: WithAuthOptions,
  handler: (ctx: AuthedContext<P>) => Promise<NextResponse>,
) {
  return async (request: NextRequest, context?: { params: Promise<P> }): Promise<NextResponse> => {
    const origin = request.headers.get('origin')
    try {
      const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
      const user = options.module
        ? await requireModuleAccess(token, options.module, options.roles)
        : await requireRoleAsync(token, options.roles)

      const requested = options.companyFromQuery === false ? null : request.nextUrl.searchParams.get('companyId')
      const companyId = requested || user.companyId
      if (!companyId) return withCors(ApiResponse.error('Company context required', 400), origin)
      if (requested && requested !== user.companyId && !(await canAccessCompany(user, requested))) {
        return withCors(ApiResponse.forbidden('You do not have access to this company'), origin)
      }

      const params = context?.params ? await context.params : ({} as P)
      const response = await handler({
        request, user, params, origin, companyId,
        db: forCompany(companyId),
        requestId: requestIdOf(request.headers),
      })
      return withCors(response, origin)
    } catch (error) {
      return withCors(handleApiError(error, request), origin)
    }
  }
}
