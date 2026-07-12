// POST /api/business-units/import/confirm  { sessionId }
// Creates the Business Units validated under the given session. Returns
// { created, skipped }. The session is consumed (single-use).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUCompanyId } from '@/app/lib/business-units/bu-utils'
import { verifyImportToken } from '@/app/lib/business-units/import-token'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await req.json().catch(() => ({}))
    const sessionId = String(body.sessionId || '').trim()
    if (!sessionId) return withCors(ApiResponse.error('sessionId is required', 400), origin)

    // The "sessionId" is a signed token carrying the validated rows + company.
    const session = verifyImportToken(sessionId)
    if (!session) return withCors(ApiResponse.error('Import session expired or invalid. Please re-validate the file.', 410), origin)

    // Ensure the caller still has access to the token's company.
    const scope = await resolveBUCompanyId(user, session.companyId)
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string
    if (companyId !== session.companyId) {
      return withCors(ApiResponse.error('Company mismatch for this import session', 403), origin)
    }

    let created = 0
    let skipped = 0

    for (const row of session.rows) {
      try {
        // Re-check duplicates at insert time (defensive against races).
        const dup = await (prisma as any).businessUnit.findFirst({
          where: {
            companyId,
            archived: 0,
            OR: [
              { name: { equals: row.name, mode: 'insensitive' } },
              ...(row.code ? [{ code: { equals: row.code, mode: 'insensitive' } }] : []),
            ],
          },
          select: { id: true },
        })
        if (dup) { skipped++; continue }

        await (prisma as any).businessUnit.create({
          data: {
            companyId,
            name: row.name,
            code: row.code,
            costCenter: row.costCenter,
            description: row.description,
            status: 'Active',
            createdBy: user.userId,
            updatedBy: user.userId,
          },
        })
        created++
      } catch {
        skipped++
      }
    }

    return withCors(ApiResponse.success({ created, skipped }, 'Import processed successfully'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
