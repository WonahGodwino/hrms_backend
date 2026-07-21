import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { logPayrollAffectingChanges, PHED_PAYROLL_AFFECTING_FIELDS } from '@/app/lib/phed/change-log'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const staff = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id },
      include: {
        grade:    true,
        region:   true,
        feeder:   true,
        payPoint: true,
        unions:   { include: { union: true } },
        cooperatives: { include: { cooperative: true } },
      },
    })
    if (!staff) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && staff.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)
    return withCors(ApiResponse.success(staff), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const updatable = [
      'firstName', 'lastName', 'email', 'phone', 'jobTitle', 'category', 'gradeId',
      'level', 'callCenter', 'resumptionDate', 'department', 'unit', 'regionId', 'feederId', 'payPointId',
      'bankName', 'accountNumber', 'accountName', 'rsaPin', 'pfaName',
      'pensionNumber', 'tin', 'nhfNumber',
      'annualRent', 'basicSalary', 'housingAllowance', 'transportAllowance',
      'furnitureAllowance', 'mealSubsidy', 'utilityAllowance', 'leaveAllowance',
      'domesticAllowance', 'hazardAllowance', 'electricityAllowance',
      'discoveryAllowance', 'carSubsidy', 'entertainmentAllowance', 'dataAllowance',
      'nightAllowance', 'arrears', 'otherAllowances',
      'voluntaryPension', 'insurance', 'cashAdvanced', 'loan', 'domesticLoan',
      'isActive', 'hasLifeAssurance', 'lifeAssuranceAmount',
    ]
    const numericFields = new Set([
      'annualRent', 'basicSalary', 'housingAllowance', 'transportAllowance',
      'furnitureAllowance', 'mealSubsidy', 'utilityAllowance', 'leaveAllowance',
      'domesticAllowance', 'hazardAllowance', 'electricityAllowance',
      'discoveryAllowance', 'carSubsidy', 'entertainmentAllowance', 'dataAllowance',
      'nightAllowance', 'arrears', 'otherAllowances',
      'voluntaryPension', 'insurance', 'cashAdvanced', 'loan', 'domesticLoan',
      'lifeAssuranceAmount',
    ])
    // Relation ID fields — empty string must become null, not be passed as-is
    const relationIdFields = new Set(['gradeId', 'regionId', 'feederId', 'payPointId'])

    const data: any = {}
    for (const key of updatable) {
      if (body[key] !== undefined) {
        if (numericFields.has(key)) {
          data[key] = body[key] ? Number(body[key]) : null
        } else if (relationIdFields.has(key)) {
          data[key] = body[key] || null   // coerce '' / 0 / false → null
        } else {
          data[key] = body[key]
        }
      }
    }

    // If hasLifeAssurance is being set to true, lifeAssuranceAmount must be present and positive
    const effectiveHasLA = body.hasLifeAssurance !== undefined ? Boolean(body.hasLifeAssurance) : undefined
    if (effectiveHasLA === true && (!body.lifeAssuranceAmount || Number(body.lifeAssuranceAmount) <= 0))
      return withCors(ApiResponse.error('lifeAssuranceAmount is required and must be greater than 0 when hasLifeAssurance is true', 400), origin)
    // Clearing life assurance — zero out the amount
    if (effectiveHasLA === false) data.lifeAssuranceAmount = null

    // Ownership check before update — select payroll-affecting fields too so
    // we can diff them against `data` for the IAD Changes tab (PRD 13.3).
    const existing = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id },
      select: { companyId: true, ...Object.fromEntries([...PHED_PAYROLL_AFFECTING_FIELDS].map(f => [f, true])) },
    })
    if (!existing) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && existing.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)

    const staff = await (prisma as any).phedStaff.update({
      where: { id: params.id },
      data,
      include: { grade: true, region: true, feeder: true, payPoint: true },
    })

    const actor = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    await logPayrollAffectingChanges({
      companyId: existing.companyId,
      staffId: params.id,
      before: existing,
      data,
      changedBy: user.userId,
      changedByName: actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown',
    })

    return withCors(ApiResponse.success(staff, 'Staff updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const existing = await (prisma as any).phedStaff.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!existing) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && existing.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)
    await (prisma as any).phedStaff.update({ where: { id: params.id }, data: { isActive: false } })
    return withCors(ApiResponse.success(null, 'Staff deactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

