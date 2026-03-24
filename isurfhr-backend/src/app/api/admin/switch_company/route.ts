// src/app/api/user/companies/route.ts
// Get companies assigned to the authenticated user and switch company context
import { NextRequest } from 'next/server'
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
        const userAssignments = await prisma.userCompany.findMany({
          where: { 
            userId: user.userId,
            role: user.role
          },
          select: { companyId: true }
        })
        
        const companyIds = userAssignments.map(a => a.companyId)
        
        if (companyIds.length === 0) {
          return withCors(
            ApiResponse.error(`${user.role} user is not assigned to any company`, 404),
            origin
          )
        }
        
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
        break

      case 'STAFF':
        const staffRecord = await prisma.staffRecord.findUnique({
          where: { id: user.userId },
          select: { companyId: true }
        })
        
        if (!staffRecord) {
          return withCors(
            ApiResponse.error('Staff record not found', 404),
            origin
          )
        }
        
        const company = await prisma.company.findUnique({
          where: { 
            id: staffRecord.companyId,
            archived: 0
          },
          select: {
            id: true,
            companyName: true,
            email: true,
          }
        })
        
        if (!company) {
          return withCors(
            ApiResponse.error('Company not found or archived', 404),
            origin
          )
        }
        
        companies = [company]
        break
    }

    // Mark the current company if user has one
    if (user.companyId) {
      companies = companies.map(company => ({
        ...company,
        isCurrent: company.id === user.companyId
      }))
    }

    return withCors(
      ApiResponse.success(
        {
          companies,
          userRole: user.role,
          currentCompanyId: user.companyId || null,
          totalCompanies: companies.length,
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
    const company = await prisma.company.findUnique({
      where: { 
        id: companyId,
        archived: 0
      },
      select: {
        id: true,
        companyName: true,
        email: true,
      }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found or archived', 404),
        origin
      )
    }

    // Verify user has access to this company using checkCompanyAccess
    const hasAccess = await checkCompanyAccess(user.userId, companyId, user.role)

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
        role: true,
      }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    // For ADMIN/HR users, get their specific role in this company
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

    // Create new JWT payload with updated company context
    // DO NOT add permissions to the token since frontend doesn't use them
    const authPayload = await createAuthPayloadWithCompanies(
      staffRecord.id,
      staffRecord.email,
      userRoleInCompany,
      companyId
    )
    // Note: We're NOT adding permissions to keep JWT simple and compatible

    // Generate new JWT token with updated company context
    const newToken = signToken(authPayload)

    // Return the new token and updated user info
    return withCors(
      ApiResponse.success(
        {
          token: newToken,
          user: {
            id: staffRecord.id,
            email: staffRecord.email,
            role: userRoleInCompany,
            companyId: companyId,
            companyName: company.companyName,
            // Frontend doesn't use permissions, so we don't return them
          },
          company: {
            id: company.id,
            name: company.companyName,
            email: company.email,
          },
          expiresIn: '7d',
          message: 'Company context switched successfully'
        },
        'Company context updated. Use the new token for subsequent requests.'
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

// Simple endpoint to refresh token with current context
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
        role: true,
      }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('User record not found', 404),
        origin
      )
    }

    // Create new JWT payload with current context
    // DO NOT add permissions to the token
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
            role: user.role,
            companyId: user.companyId,
            // No permissions returned
          },
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