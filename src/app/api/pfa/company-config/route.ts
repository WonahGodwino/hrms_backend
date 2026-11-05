// src/app/api/pfa/company-config/route.ts
//
// Per-company PFA opt-out configuration. GET returns the merged view (every
// globally-active PFA plus whether the caller's company has disabled it and
// how many of that company's staff are currently affected) that the
// per-company toggle column on PfaAdminPage.jsx needs. PATCH flips one PFA's
// disabled state for the caller's company. Scoped strictly to user.companyId
// (no cross-company override for SUPER_ADMIN in v1 — matches how every other
// company-scoped admin config endpoint in this codebase works).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { findCompanyDisabledCodesInUse } from '@/app/lib/staff/pension-fields'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffActivity } from '@/app/lib/device/device-utils'

const ALLOWED_ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !ALLOWED_ROLES.includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)
    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)

    const [pfas, disabledRows, inUse] = await Promise.all([
      prisma.pensionFundAdministrator.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.companyDisabledPfa.findMany({ where: { companyId: user.companyId }, select: { pfaCode: true } }),
      findCompanyDisabledCodesInUse(user.companyId),
    ])

    const disabledCodes = new Set(disabledRows.map((d) => d.pfaCode))
    const affectedByCode = new Map(inUse.map((g) => [g.pfaCode, g.staff.length]))

    const pfaConfig = pfas.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      disabledForCompany: disabledCodes.has(p.code),
      staffAffected: affectedByCode.get(p.code) ?? 0,
    }))

    return withCors(ApiResponse.success({ pfas: pfaConfig }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function PATCH(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !ALLOWED_ROLES.includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)
    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)

    const body = await req.json()
    const pfaCode = typeof body?.pfaCode === 'string' ? body.pfaCode.trim().toUpperCase() : ''
    const disabled = Boolean(body?.disabled)
    if (!pfaCode) return withCors(ApiResponse.error('pfaCode is required', 400), origin)

    const pfa = await prisma.pensionFundAdministrator.findUnique({ where: { code: pfaCode } })
    if (!pfa) return withCors(ApiResponse.error(`Unknown PFA code "${pfaCode}"`, 404), origin)

    if (disabled) {
      await prisma.companyDisabledPfa.upsert({
        where: { companyId_pfaCode: { companyId: user.companyId, pfaCode } },
        update: { disabledBy: user.userId },
        create: { companyId: user.companyId, pfaCode, disabledBy: user.userId },
      })
    } else {
      await prisma.companyDisabledPfa.deleteMany({ where: { companyId: user.companyId, pfaCode } })
    }

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    if (staff) {
      await logStaffActivity({
        staffRecordId: user.userId,
        companyId: user.companyId,
        action: 'PFA_COMPANY_ACCESS_UPDATED',
        performedById: user.userId,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: user.role,
        details: { pfaCode, disabled },
      })
    }

    const staffAffected = disabled
      ? (await findCompanyDisabledCodesInUse(user.companyId)).find((g) => g.pfaCode === pfaCode)?.staff.length ?? 0
      : 0

    return withCors(
      ApiResponse.success(
        { id: pfa.id, code: pfa.code, name: pfa.name, disabledForCompany: disabled, staffAffected },
        'PFA company configuration updated'
      ),
      origin
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}
