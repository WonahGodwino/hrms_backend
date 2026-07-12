import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '../../_helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Validate & normalise the optional designation/grade scope. A grade level can
// only be set together with a designation. Returns cleaned ids or an error.
async function validateScope(
  companyId: string,
  designationId: unknown,
  gradeLevelId: unknown,
): Promise<{ designationId: string | null; gradeLevelId: string | null; error?: string }> {
  const desId = designationId ? String(designationId).trim() : ''
  const gradeId = gradeLevelId ? String(gradeLevelId).trim() : ''

  if (gradeId && !desId) {
    return { designationId: null, gradeLevelId: null, error: 'A grade level can only be scoped together with a designation' }
  }
  if (desId) {
    const des = await (prisma as any).designation.findFirst({ where: { id: desId, companyId }, select: { id: true } })
    if (!des) return { designationId: null, gradeLevelId: null, error: 'Selected designation not found for this company' }
  }
  if (gradeId) {
    const grade = await prisma.gradeLevel.findFirst({ where: { id: gradeId, companyId }, select: { id: true } })
    if (!grade) return { designationId: null, gradeLevelId: null, error: 'Selected grade level not found for this company' }
  }
  return { designationId: desId || null, gradeLevelId: gradeId || null }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const { searchParams } = new URL(request.url)
    const requestedCompanyId = searchParams.get('companyId')
    const showInactive = searchParams.get('showInactive') === 'true'
    const jobId = searchParams.get('jobId')

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (scopedCompanyIds.length === 0) return withCors(ApiResponse.success([], 'No company access'), origin)

    let companyFilter = scopedCompanyIds
    if (requestedCompanyId && scopedCompanyIds.includes(requestedCompanyId)) {
      companyFilter = [requestedCompanyId]
    }

    const designationFilter = searchParams.get('designationId')

    const where: any = { companyId: { in: companyFilter } }
    const andConds: any[] = []
    if (!showInactive && !['ADMIN', 'SUPER_ADMIN', 'HR'].includes(user.role)) {
      where.isActive = true
    }
    // When a job is supplied, return benefits scoped to it plus the all-roles ones.
    if (jobId) {
      andConds.push({ OR: [{ jobId: null }, { jobId }] })
    }
    // Management view may filter by a specific designation.
    if (designationFilter && user.role !== 'STAFF') {
      andConds.push({ OR: [{ designationId: null }, { designationId: designationFilter }] })
    }

    // For STAFF, resolve their designation + current grade and scope the query so
    // they ONLY see benefits that apply to them (their designation, and grade
    // level when the benefit is grade-scoped). Out-of-scope benefits are hidden.
    let staffRecord: any = null
    if (user.role === 'STAFF') {
      staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true, companyId: { in: companyFilter } },
        select: { id: true, createdAt: true, designationId: true, currentGradeId: true } as any,
      })
      const desId = staffRecord?.designationId ?? null
      const gradeId = staffRecord?.currentGradeId ?? null
      // designation: benefit is company-wide (null) OR matches the staff's designation
      andConds.push({ OR: [{ designationId: null }, { designationId: desId ?? '__no_designation__' }] })
      // grade: benefit is grade-agnostic (null) OR matches the staff's grade
      andConds.push({ OR: [{ gradeLevelId: null }, { gradeLevelId: gradeId ?? '__no_grade__' }] })
    }

    if (andConds.length) where.AND = andConds

    const policies = await (prisma as any).benefitPolicy.findMany({
      where,
      orderBy: { category: 'asc' },
    })

    // Tenure for STAFF eligibility messaging.
    let monthsEmployed = 0
    if (user.role === 'STAFF' && staffRecord) {
      monthsEmployed = Math.floor((Date.now() - new Date(staffRecord.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    }

    // Attach designation/grade names for the management view (ADMIN/HR).
    let designationNames: Record<string, string> = {}
    let gradeNames: Record<string, string> = {}
    if (user.role !== 'STAFF') {
      const desIds = Array.from(new Set(policies.map((p: any) => p.designationId).filter(Boolean))) as string[]
      const gradeIds = Array.from(new Set(policies.map((p: any) => p.gradeLevelId).filter(Boolean))) as string[]
      if (desIds.length) {
        const rows = await (prisma as any).designation.findMany({ where: { id: { in: desIds } }, select: { id: true, title: true } })
        designationNames = Object.fromEntries(rows.map((r: any) => [r.id, r.title]))
      }
      if (gradeIds.length) {
        const rows = await prisma.gradeLevel.findMany({ where: { id: { in: gradeIds } }, select: { id: true, name: true } })
        gradeNames = Object.fromEntries(rows.map((r) => [r.id, r.name]))
      }
    }

    const result = policies.map((policy: any) => {
      const item: any = {
        ...policy,
        designationName: policy.designationId ? (designationNames[policy.designationId] || null) : null,
        gradeLevelName: policy.gradeLevelId ? (gradeNames[policy.gradeLevelId] || null) : null,
      }
      if (user.role === 'STAFF') {
        // Only in-scope policies reach here; remaining check is tenure.
        if (policy.eligibilityRule) {
          try {
            const rule = JSON.parse(policy.eligibilityRule)
            if (rule.minServiceMonths) {
              item.isEligible = monthsEmployed >= rule.minServiceMonths
              if (!item.isEligible) {
                item.eligibilityReason = `Requires ${rule.minServiceMonths} months of service (you have ${monthsEmployed})`
              }
            } else {
              item.isEligible = true
            }
          } catch {
            item.isEligible = true
          }
        } else {
          item.isEligible = true
        }
      }
      return item
    })

    return withCors(ApiResponse.success(result, 'Benefit policies fetched successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await request.json()
    const { companyId, name, category, description, monetaryValue, keyValue, eligibilityRule, isActive, jobId, designationId, gradeLevelId } = body

    if (!companyId || !name || !category) {
      return withCors(ApiResponse.error('companyId, name, and category are required', 400), origin)
    }

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    // Validate the optional designation/grade scope belongs to the company.
    const scope = await validateScope(companyId, designationId, gradeLevelId)
    if (scope.error) return withCors(ApiResponse.error(scope.error, 400), origin)

    const policy = await (prisma as any).benefitPolicy.create({
      data: {
        companyId,
        name,
        category,
        description: description ?? null,
        monetaryValue: monetaryValue ?? null,
        keyValue: keyValue ?? null,
        eligibilityRule: eligibilityRule ?? null,
        isActive: isActive ?? true,
        // Optional job scope (null/blank = applies to all roles).
        ...(jobId ? { jobId } : {}),
        designationId: scope.designationId,
        gradeLevelId: scope.gradeLevelId,
      },
    })

    return withCors(ApiResponse.success(policy, 'Benefit policy created successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return withCors(ApiResponse.error('Policy id is required', 400), origin)

    const existing = await prisma.benefitPolicy.findUnique({ where: { id } })
    if (!existing) return withCors(ApiResponse.error('Benefit policy not found', 404), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(existing.companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    // When either scope field is present in the payload, validate & normalise both
    // together (they are interdependent).
    if ('designationId' in updates || 'gradeLevelId' in updates) {
      const scope = await validateScope(existing.companyId, updates.designationId, updates.gradeLevelId)
      if (scope.error) return withCors(ApiResponse.error(scope.error, 400), origin)
      updates.designationId = scope.designationId
      updates.gradeLevelId = scope.gradeLevelId
    }

    const policy = await (prisma as any).benefitPolicy.update({ where: { id }, data: updates })
    return withCors(ApiResponse.success(policy, 'Benefit policy updated successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return withCors(ApiResponse.error('Policy id is required', 400), origin)

    const existing = await prisma.benefitPolicy.findUnique({ where: { id } })
    if (!existing) return withCors(ApiResponse.error('Benefit policy not found', 404), origin)

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(existing.companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    await prisma.benefitPolicy.delete({ where: { id } })
    return withCors(ApiResponse.success(null, 'Benefit policy deleted successfully'), origin)
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}