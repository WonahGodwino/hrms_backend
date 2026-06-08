import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '../../_helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
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

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (scopedCompanyIds.length === 0) return withCors(ApiResponse.success([], 'No company access'), origin)

    let companyFilter = scopedCompanyIds
    if (requestedCompanyId && scopedCompanyIds.includes(requestedCompanyId)) {
      companyFilter = [requestedCompanyId]
    }

    const where: any = { companyId: { in: companyFilter } }
    if (!showInactive && !['ADMIN', 'SUPER_ADMIN', 'HR'].includes(user.role)) {
      where.isActive = true
    }

    const policies = await prisma.benefitPolicy.findMany({
      where,
      orderBy: { category: 'asc' },
    })

    // For STAFF, compute eligibility if eligibilityRule is set
    let staffEligibility: any = {}
    if (user.role === 'STAFF') {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { id: true, createdAt: true },
      })
      if (staffRecord) {
        const monthsEmployed = Math.floor((Date.now() - new Date(staffRecord.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
        staffEligibility = { monthsEmployed }
      }
    }

    const result = policies.map(policy => {
      const item: any = { ...policy }
      if (user.role === 'STAFF') {
        // Parse eligibility rule — simple tenure check by default
        if (policy.eligibilityRule) {
          try {
            const rule = JSON.parse(policy.eligibilityRule)
            if (rule.minServiceMonths) {
              item.isEligible = staffEligibility.monthsEmployed >= rule.minServiceMonths
              if (!item.isEligible) {
                item.eligibilityReason = `Requires ${rule.minServiceMonths} months of service (you have ${staffEligibility.monthsEmployed})`
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
    const { companyId, name, category, description, monetaryValue, keyValue, eligibilityRule, isActive } = body

    if (!companyId || !name || !category) {
      return withCors(ApiResponse.error('companyId, name, and category are required', 400), origin)
    }

    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const policy = await prisma.benefitPolicy.create({
      data: {
        companyId,
        name,
        category,
        description: description ?? null,
        monetaryValue: monetaryValue ?? null,
        keyValue: keyValue ?? null,
        eligibilityRule: eligibilityRule ?? null,
        isActive: isActive ?? true,
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

    const policy = await prisma.benefitPolicy.update({ where: { id }, data: updates })
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