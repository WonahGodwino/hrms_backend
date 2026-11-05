// src/app/api/help/contacts/route.ts
//
// Help & Support — who to contact at the user's company.
//
// GET /api/help/contacts[?companyId=]
//   → { companyId, companyName, email, phone, hrRepName, hrRepTitle,
//       hrContacts: [{ name, email, position, role }] }
//
// Read-only. Exists because staff can't read /companies/[id] (HR/ADMIN/
// SUPER_ADMIN only) but every role's help page needs the company's HR contact.
// Only public-facing contact fields are returned. `companyId` is honoured only
// for a company the caller belongs to (SUPER_ADMIN: any); otherwise the
// caller's current company from the token is used.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

const MAX_HR_CONTACTS = 5

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
    const user = requireRole(authHeader.replace('Bearer ', ''), ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    const requested = new URL(request.url).searchParams.get('companyId')
    const memberOf = new Set([user.companyId, ...(user.companyIds ?? [])].filter(Boolean) as string[])
    let companyId =
      requested && (user.role === 'SUPER_ADMIN' || memberOf.has(requested)) ? requested : user.companyId ?? null

    // Older tokens may not carry a company — fall back to the staff record.
    if (!companyId) {
      const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { companyId: true } })
      companyId = staff?.companyId ?? null
    }
    if (!companyId) {
      return withCors(ApiResponse.success({ companyId: null, hrContacts: [] }), origin)
    }

    const [company, hrStaff] = await Promise.all([
      prisma.company.findFirst({
        where: { id: companyId, archived: 0 },
        select: { id: true, companyName: true, email: true, phone: true, hrRepName: true, hrRepTitle: true },
      }),
      prisma.staffRecord.findMany({
        where: { companyId, isActive: true, role: { in: ['HR', 'ADMIN'] } },
        select: { firstName: true, lastName: true, email: true, position: true, role: true },
        orderBy: [{ role: 'desc' }, { firstName: 'asc' }], // HR before ADMIN
        take: MAX_HR_CONTACTS,
      }),
    ])

    if (!company) {
      return withCors(ApiResponse.success({ companyId, hrContacts: [] }), origin)
    }

    return withCors(
      ApiResponse.success({
        companyId: company.id,
        companyName: company.companyName,
        email: company.email,
        phone: company.phone,
        hrRepName: company.hrRepName,
        hrRepTitle: company.hrRepTitle,
        hrContacts: hrStaff.map((s) => ({
          name: `${s.firstName} ${s.lastName}`.trim(),
          email: s.email,
          position: s.position,
          role: s.role,
        })),
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
