import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { normalizeState } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PUT /api/phed/tax-profiles/:staffId
// Sets/updates a single staff member's state of residence (and optional JTB TIN).
export async function PUT(req: NextRequest, { params }: { params: { staffId: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const companyId = body.companyId || user.companyId || ''
    const stateRaw  = body.stateOfResidence || ''
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && user.companyId !== companyId) {
      return withCors(ApiResponse.error('You do not have permission to edit this company', 403), origin)
    }

    const state = normalizeState(stateRaw)
    if (!state) {
      return withCors(ApiResponse.error('Invalid state. Use Akwa Ibom, Bayelsa, Cross River or Rivers.', 400), origin)
    }

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { staffId_companyId: { staffId: params.staffId, companyId } },
      select: { id: true },
    })
    if (!staffRecord) return withCors(ApiResponse.notFound('No staff record found for this Staff ID'), origin)

    const profile = await prisma.employeeTaxProfile.upsert({
      where: { staffId: staffRecord.id },
      create: {
        staffId: staffRecord.id,
        companyId,
        stateOfResidence: state,
        jtbTin: body.jtbTin || null,
        tinVerified: false,
      },
      update: {
        stateOfResidence: state,
        ...(body.jtbTin ? { jtbTin: body.jtbTin } : {}),
      },
    })

    return withCors(ApiResponse.success({ staffId: params.staffId, stateOfResidence: profile.stateOfResidence, jtbTin: profile.jtbTin ?? '' }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
