// src/app/api/admin/switch_company/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { 
  requireRole, 
  createAuthPayloadWithCompanies, 
  signToken, 
  checkCompanyAccess,
  AuthUser
} from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET: Get all companies accessible to the user
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const includeAll = searchParams.get('includeAll') === 'true'

    let companies: Array<{
      id: string
      companyName: string
      email?: string
      isCurrent?: boolean
    }> = []

    switch (user.role) {
      case 'SUPER_ADMIN':
        if (includeAll) {
          // SUPER_ADMIN can see all companies
          companies = await prisma.company.findMany({
            where: { archived: 0 },
            select: {
              id: true,
              companyName: true,
              email: true,
            },
            orderBy: { companyName: 'asc' }
          })
        } else {
          // Or only assigned ones
          const userAssignments = await prisma.userCompany.findMany({
            where: { userId: user.userId },
            select: { companyId: true }
          })
          
          const companyIds = userAssignments.map(a => a.companyId)
          
          if (companyIds.length > 0) {
            companies = await prisma.company.findMany({
              where: {
                id: { in: companyIds },
                archived: 0
              },
              select: {
                id: true,
                companyName: true,
                email: true,
              },
              orderBy: { companyName: 'asc' }
            })
          } else {
            // Fallback to all companies if no assignments
            companies = await prisma.company.findMany({
              where: { archived: 0 },
              select: {
                id: true,
                companyName: true,
                email: true,
              },
              orderBy: { companyName: 'asc' }
            })
          }
        }
        break

      case 'ADMIN':
      case 'HR':
        // Get assigned companies from user_companies
        const userAssignments = await prisma.userCompany.findMany({
          where: { 
            userId: user.userId,
            role: user.role === 'HR' ? 'HR' : { in: ['ADMIN', 'HR'] }
          },
          select: { 
            companyId: true,
            company: {
              select: {
                id: true,
                companyName: true,
                email: true,
              }
            }
          }
        })
        
        if (userAssignments.length === 0) {
          // No assignments found
          companies = []
        } else {
          companies = userAssignments.map(a => ({
            id: a.company.id,
            companyName: a.company.companyName,
            email: a.company.email,
          }))
        }
        break

      case 'STAFF':
        // STAFF only has their own company
        const staffRecord = await prisma.staffRecord.findUnique({
          where: { id: user.userId },
          select: { 
            companyId: true,
            company: {
              select: {
                id: true,
                companyName: true,
                email: true,
              }
            }
          }
        })
        
        if (staffRecord?.company) {
          companies = [{
            id: staffRecord.company.id,
            companyName: staffRecord.company.companyName,
            email: staffRecord.company.email,
          }]
        }
        break
    }

    // Mark the current company if user has one in token
    if (user.companyId) {
      companies = companies.map(company => ({
        ...company,
        isCurrent: company.id === user.companyId
      }))
    }

    // Get the currently selected company details (if any)
    let currentCompany = null
    if (user.companyId) {
      const current = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, companyName: true, email: true }
      })
      if (current) {
        currentCompany = current
      }
    }

    return withCors(
      ApiResponse.success(
        {
          companies,
          currentCompany,
          userRole: user.role,
          totalCompanies: companies.length,
          requiresCompanySelection: (user.role === 'ADMIN' || user.role === 'HR') && companies.length > 0 && !user.companyId
        },
        'Companies fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}

// POST: Switch to a different company (returns company info for frontend global state)
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

    // Verify company exists and is not archived
    const company = await prisma.company.findFirst({
      where: { 
        id: companyId,
        archived: 0
      },
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

    // Verify user has access to this company
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
      // ADMIN or HR - check user_companies
      const assignment = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: companyId,
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

    // Get user's current information from database
    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    // Get user's specific role in this company (for ADMIN/HR)
    let userRoleInCompany = user.role
    if (user.role === 'ADMIN' || user.role === 'HR') {
      const userCompany = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: user.userId,
            companyId: companyId
          }
        },
        select: { role: true }
      })
      
      if (userCompany) {
        userRoleInCompany = userCompany.role
      }
    }

    // Generate new JWT token with updated company context
    const authPayload = await createAuthPayloadWithCompanies(
      staffRecord.id,
      staffRecord.email,
      userRoleInCompany,
      companyId
    )
    const newToken = signToken(authPayload)

    // Get all accessible companies for the switcher dropdown
    let accessibleCompanies: Array<{ id: string; companyName: string; email?: string }> = []
    if (user.role === 'SUPER_ADMIN') {
      accessibleCompanies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true, companyName: true, email: true },
        orderBy: { companyName: 'asc' }
      })
    } else if (user.role === 'ADMIN' || user.role === 'HR') {
      const assignments = await prisma.userCompany.findMany({
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
      accessibleCompanies = assignments.map(a => a.company)
    }

    // Return comprehensive response for frontend to store in global state
    return withCors(
      ApiResponse.success(
        {
          // New JWT token with updated company context
          token: newToken,
          
          // Selected company details (for frontend global state)
          selectedCompany: {
            id: company.id,
            name: company.companyName,
            email: company.email,
            phone: company.phone,
            address: company.address,
            logo: company.logo,
            taxId: company.taxId,
          },
          
          // User info with updated context
          user: {
            id: staffRecord.id,
            email: staffRecord.email,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            role: userRoleInCompany,
            companyId: companyId,
          },
          
          // List of all accessible companies (for dropdown)
          accessibleCompanies,
          
          // Token expiry info
          expiresIn: '7d',
          
          // Metadata
          message: 'Company context switched successfully',
          switchedAt: new Date().toISOString(),
        },
        'Company switched successfully. Store selectedCompany and token in your global state.'
      ),
      origin
    )
  } catch (error) {
    console.error('[COMPANY_SWITCH] Error:', error)
    return withCors(
      handleApiError(error),
      origin
    )
  }
}

// PATCH: Refresh token with current company context
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

    // Get user from database
    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    // Get current company info if user has one
    let currentCompany = null
    if (user.companyId) {
      currentCompany = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, companyName: true, email: true }
      })
    }

    // Create new JWT payload with current context
    const authPayload = await createAuthPayloadWithCompanies(
      staffRecord.id,
      staffRecord.email,
      user.role,
      user.companyId
    )
    const newToken = signToken(authPayload)

    return withCors(
      ApiResponse.success(
        {
          token: newToken,
          user: {
            id: staffRecord.id,
            email: staffRecord.email,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            role: user.role,
            companyId: user.companyId,
          },
          currentCompany,
          expiresIn: '7d',
          message: 'Token refreshed with current context'
        },
        'Token refreshed successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}

// DELETE: Clear company context (logout or reset)
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

    // Get user without company context
    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    // Generate new token WITHOUT company context
    const authPayload = await createAuthPayloadWithCompanies(
      staffRecord.id,
      staffRecord.email,
      user.role,
      undefined // No company context
    )
    const newToken = signToken(authPayload)

    return withCors(
      ApiResponse.success(
        {
          token: newToken,
          user: {
            id: staffRecord.id,
            email: staffRecord.email,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            role: user.role,
            companyId: null,
          },
          message: 'Company context cleared. Please select a company to continue.'
        },
        'Company context cleared successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}