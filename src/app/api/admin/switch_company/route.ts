// src/app/api/admin/switch_company/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { 
  requireRole, 
  createAuthPayloadWithCompanies, 
  signToken, 
  checkCompanyAccess
} from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// Types
interface CompanyInfo {
  id: string
  companyName: string
  email: string | null
  phone?: string | null
  address?: string | null
  logo?: string | null
  taxId?: string | null
  isCurrent?: boolean
}

interface UserInfo {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  companyId: string | null
}

interface SwitchCompanyResponse {
  token: string
  selectedCompany: CompanyInfo
  user: UserInfo
  accessibleCompanies: CompanyInfo[]
  expiresIn: string
  switchedAt: string
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET: Get all companies accessible to the authenticated user
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN', 'STAFF'])

    const { searchParams } = new URL(request.url)
    const includeAll = searchParams.get('includeAll') === 'true'

    let companies: CompanyInfo[] = []

    switch (user.role) {
      case 'SUPER_ADMIN': {
        if (includeAll) {
          const allCompanies = await prisma.company.findMany({
            where: { archived: 0 },
            select: { id: true, companyName: true, email: true },
            orderBy: { companyName: 'asc' }
          })
          companies = allCompanies
        } else {
          const userAssignments = await prisma.userCompany.findMany({
            where: { userId: user.userId },
            select: { companyId: true }
          })
          
          const companyIds = userAssignments.map(a => a.companyId)
          
          if (companyIds.length > 0) {
            const assignedCompanies = await prisma.company.findMany({
              where: { id: { in: companyIds }, archived: 0 },
              select: { id: true, companyName: true, email: true },
              orderBy: { companyName: 'asc' }
            })
            companies = assignedCompanies
          } else {
            const allCompanies = await prisma.company.findMany({
              where: { archived: 0 },
              select: { id: true, companyName: true, email: true },
              orderBy: { companyName: 'asc' }
            })
            companies = allCompanies
          }
        }
        break
      }

      case 'ADMIN':
      case 'HR': {
        const userAssignments = await prisma.userCompany.findMany({
          where: { 
            userId: user.userId,
            role: user.role === 'HR' ? 'HR' : { in: ['ADMIN', 'HR'] }
          },
          include: {
            company: {
              select: { id: true, companyName: true, email: true }
            }
          }
        })
        
        companies = userAssignments.map(a => a.company)
        break
      }

      case 'STAFF': {
        const staffRecord = await prisma.staffRecord.findUnique({
          where: { id: user.userId },
          include: {
            company: { select: { id: true, companyName: true, email: true } }
          }
        })
        
        if (staffRecord?.company) {
          companies = [staffRecord.company]
        }
        break
      }
    }

    // Mark current company
    if (user.companyId) {
      companies = companies.map(company => ({
        ...company,
        isCurrent: company.id === user.companyId
      }))
    }

    let currentCompany: CompanyInfo | null = null
    if (user.companyId) {
      const current = await prisma.company.findUnique({
        where: { id: user.companyId, archived: 0 },
        select: { id: true, companyName: true, email: true }
      })
      if (current) currentCompany = current
    }

    return withCors(
      ApiResponse.success({
        companies,
        currentCompany,
        userRole: user.role,
        totalCompanies: companies.length,
        requiresCompanySelection: (user.role === 'ADMIN' || user.role === 'HR') && companies.length > 0 && !user.companyId
      }),
      origin
    )
  } catch (error) {
    console.error('[GET /api/admin/switch_company] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}

/**
 * POST: Switch to a different company
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN'])

    const body = await request.json()
    const { companyId } = body

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Verify company exists and is active
    const company = await prisma.company.findFirst({
      where: { id: companyId, archived: 0 },
      select: {
        id: true,
        companyName: true,
        email: true,
        phone: true,
        address: true,
        logo: true,
        taxId: true,
      }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found or archived', 404),
        origin
      )
    }

    // Verify user access
    let hasAccess = false

    if (user.role === 'SUPER_ADMIN') {
      hasAccess = true
    } else if (user.role === 'STAFF') {
      const staffRecord = await prisma.staffRecord.findUnique({
        where: { id: user.userId },
        select: { companyId: true }
      })
      hasAccess = staffRecord?.companyId === companyId
    } else {
      const assignment = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId,
          role: user.role === 'HR' ? 'HR' : { in: ['ADMIN', 'HR'] }
        }
      })
      hasAccess = !!assignment
    }

    if (!hasAccess) {
      return withCors(
        ApiResponse.error('You do not have access to this company', 403),
        origin
      )
    }

    // Get user details
    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    // Get user's role in this company
    let userRoleInCompany = user.role
    if (user.role === 'ADMIN' || user.role === 'HR') {
      const userCompany = await prisma.userCompany.findUnique({
        where: { userId_companyId: { userId: user.userId, companyId } },
        select: { role: true }
      })
      if (userCompany) userRoleInCompany = userCompany.role
    }

    // Generate new token
    const authPayload = await createAuthPayloadWithCompanies(
      staffRecord.id,
      staffRecord.email,
      userRoleInCompany,
      companyId
    )
    const newToken = signToken(authPayload)

    // Get accessible companies for dropdown
    let accessibleCompanies: CompanyInfo[] = []
    
    if (user.role === 'SUPER_ADMIN') {
      accessibleCompanies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true, companyName: true, email: true },
        orderBy: { companyName: 'asc' }
      })
    } else if (user.role === 'ADMIN' || user.role === 'HR') {
      const assignments = await prisma.userCompany.findMany({
        where: { userId: user.userId, role: user.role === 'HR' ? 'HR' : { in: ['ADMIN', 'HR'] } },
        include: { company: { select: { id: true, companyName: true, email: true } } }
      })
      accessibleCompanies = assignments.map(a => a.company)
    }

    const response: SwitchCompanyResponse = {
      token: newToken,
      selectedCompany: company,
      user: {
        id: staffRecord.id,
        email: staffRecord.email,
        firstName: staffRecord.firstName,
        lastName: staffRecord.lastName,
        role: userRoleInCompany,
        companyId,
      },
      accessibleCompanies,
      expiresIn: '7d',
      switchedAt: new Date().toISOString(),
    }

    return withCors(
      ApiResponse.success(response, 'Company switched successfully'),
      origin
    )
  } catch (error) {
    console.error('[POST /api/admin/switch_company] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}

/**
 * PATCH: Refresh token with current company context
 */
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN', 'STAFF'])

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    let currentCompany: CompanyInfo | null = null
    if (user.companyId) {
      currentCompany = await prisma.company.findUnique({
        where: { id: user.companyId, archived: 0 },
        select: { id: true, companyName: true, email: true }
      })
    }

    const authPayload = await createAuthPayloadWithCompanies(
      staffRecord.id,
      staffRecord.email,
      user.role,
      user.companyId || undefined
    )
    const newToken = signToken(authPayload)

    return withCors(
      ApiResponse.success({
        token: newToken,
        user: {
          id: staffRecord.id,
          email: staffRecord.email,
          firstName: staffRecord.firstName,
          lastName: staffRecord.lastName,
          role: user.role,
          companyId: user.companyId || null,
        },
        currentCompany,
        expiresIn: '7d',
      }, 'Token refreshed successfully'),
      origin
    )
  } catch (error) {
    console.error('[PATCH /api/admin/switch_company] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}

/**
 * DELETE: Clear company context
 */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN', 'STAFF'])

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    const authPayload = await createAuthPayloadWithCompanies(
      staffRecord.id,
      staffRecord.email,
      user.role,
      undefined
    )
    const newToken = signToken(authPayload)

    return withCors(
      ApiResponse.success({
        token: newToken,
        user: {
          id: staffRecord.id,
          email: staffRecord.email,
          firstName: staffRecord.firstName,
          lastName: staffRecord.lastName,
          role: user.role,
          companyId: null,
        },
      }, 'Company context cleared'),
      origin
    )
  } catch (error) {
    console.error('[DELETE /api/admin/switch_company] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}