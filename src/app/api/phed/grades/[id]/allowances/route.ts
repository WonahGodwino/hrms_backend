import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { canAccessCompany } from '@/app/lib/access/company-access'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/phed/grades/:id/allowances
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    // SEC-018: the grade must belong to a company the caller can access.
    const grade = await prisma.phedGrade.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!grade || !(await canAccessCompany(user, grade.companyId)))
      return withCors(ApiResponse.notFound('Grade not found'), origin)

    const templates = await prisma.phedAllowanceTemplate.findMany({
      where: { gradeId: params.id },
      orderBy: { allowanceType: 'asc' },
    })
    return withCors(ApiResponse.success(templates), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// PUT /api/phed/grades/:id/allowances — upsert all templates at once
// Body: { templates: [{ allowanceType, valueType, value }] }
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    // SEC-018: the grade must belong to a company the caller can access.
    const grade = await prisma.phedGrade.findUnique({ where: { id: params.id }, select: { companyId: true } })
    if (!grade || !(await canAccessCompany(user, grade.companyId)))
      return withCors(ApiResponse.notFound('Grade not found'), origin)

    const body = await req.json()
    const allowances = body.allowances ?? body.templates
    if (!Array.isArray(allowances))
      return withCors(ApiResponse.error('allowances array is required', 400), origin)

    const VALID_ALLOWANCE_TYPES = [
      'HOUSING', 'TRANSPORT', 'FURNITURE', 'MEAL_SUBSIDY', 'UTILITY',
      'LEAVE', 'DOMESTIC', 'HAZARD', 'ELECTRICITY', 'DISCOVERY',
      'CAR_SUBSIDY', 'ENTERTAINMENT', 'DATA', 'NIGHT', 'ARREARS', 'OTHER',
    ]
    for (const t of allowances) {
      if (!VALID_ALLOWANCE_TYPES.includes(t.allowanceType))
        return withCors(ApiResponse.error(`Invalid allowanceType: "${t.allowanceType}"`, 400), origin)
      const val = Number(t.value)
      if (t.valueType === 'PERCENTAGE' && val > 100)
        return withCors(ApiResponse.error('PERCENTAGE value cannot exceed 100', 400), origin)
      if (t.valueType === 'FIXED' && val < 0)
        return withCors(ApiResponse.error('FIXED value cannot be negative', 400), origin)
    }

    const results = await Promise.all(
      allowances.map((t: any) =>
        prisma.phedAllowanceTemplate.upsert({
          where: {
            gradeId_allowanceType: { gradeId: params.id, allowanceType: t.allowanceType },
          },
          create: {
            gradeId:      params.id,
            allowanceType: t.allowanceType,
            valueType:    t.valueType,
            value:        Number(t.value),
          },
          update: {
            valueType: t.valueType,
            value:     Number(t.value),
          },
        })
      )
    )

    return withCors(ApiResponse.success(results, 'Allowance templates saved'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

