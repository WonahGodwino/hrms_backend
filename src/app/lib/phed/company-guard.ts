// SEC-018: PHED routes take `companyId` from the query string, form data or
// JSON body. This rejects a company the caller cannot access before the route
// reads or writes anything for it.
import type { NextResponse } from 'next/server'
import type { AuthUser } from '@/app/lib/auth'
import { ApiResponse } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'
import { canAccessCompany } from '@/app/lib/access/company-access'

/**
 * Returns a 403 response when `companyId` is a company the caller cannot
 * access, otherwise null. A missing or non-string value returns null so the
 * route's own "companyId is required" validation still applies.
 */
export async function rejectForeignCompany(
  user: Pick<AuthUser, 'userId' | 'role' | 'companyId'>,
  companyId: unknown,
  origin: string | null,
): Promise<NextResponse | null> {
  if (typeof companyId !== 'string' || !companyId) return null
  if (await canAccessCompany(user, companyId)) return null
  return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
}
