import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/phed/grades?companyId=xxx&category=REGULAR
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId') ?? user.companyId ?? null
    const category  = searchParams.get('category')

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    // Prevent cross-company data leakage (SUPER_ADMIN may query any company)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const grades = await (prisma as any).phedGrade.findMany({
      where: {
        companyId,
        ...(category ? { category } : {}),
        isActive: true,
      },
      include: { allowanceTemplates: true },
      orderBy: [{ category: 'asc' }, { levelOrder: 'asc' }],
    })

    return withCors(ApiResponse.success(grades), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/phed/grades
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { companyId, name, code, category, levelOrder, defaultBasicSalary } = body

    if (!companyId || !name || !code || !category || levelOrder === undefined)
      return withCors(ApiResponse.error('companyId, name, code, category, levelOrder are required', 400), origin)

    // Type safety — reject Prisma operator injection attempts
    if (typeof companyId !== 'string' || typeof name !== 'string' || typeof code !== 'string')
      return withCors(ApiResponse.error('Invalid field types', 400), origin)

    const VALID_CATEGORIES = ['REGULAR', 'CONTRACT', 'NYSC_IT']
    if (!VALID_CATEGORIES.includes(category))
      return withCors(ApiResponse.error(`category must be one of: ${VALID_CATEGORIES.join(', ')}`, 400), origin)

    if (!Number.isInteger(Number(levelOrder)) || Number(levelOrder) < 1)
      return withCors(ApiResponse.error('levelOrder must be a positive integer', 400), origin)

    if (defaultBasicSalary !== undefined && Number(defaultBasicSalary) < 0)
      return withCors(ApiResponse.error('defaultBasicSalary cannot be negative', 400), origin)

    const grade = await (prisma as any).phedGrade.create({
      data: {
        companyId,
        name,
        code: code.toUpperCase(),
        category,
        levelOrder: Number(levelOrder),
        defaultBasicSalary: defaultBasicSalary ? Number(defaultBasicSalary) : null,
      },
    })

    return withCors(ApiResponse.success(grade, 'Grade created', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

