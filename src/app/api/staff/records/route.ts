// src/app/api/staff/records/route.ts
// src/app/api/staff/records/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
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

    const token = authHeader.replace('Bearer ', '').trim()
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'MANAGER', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const department = searchParams.get('department')
    const search = searchParams.get('search')
    const includeInactive = searchParams.get('includeInactive') === 'true'
    
    // IMPORTANT: Get companyId from query parameter (set by frontend from company switcher)
    const companyId = searchParams.get('companyId')

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {
      company: { archived: 0 }
    }

    // Handle company filtering based on role
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN: Use companyId if provided
      if (companyId) {
        const company = await prisma.company.findFirst({
          where: { id: companyId, archived: 0 }
        })
        if (!company) {
          return withCors(
            ApiResponse.error('Company not found or archived', 404),
            origin
          )
        }
        where.companyId = companyId
      }
      // If no companyId, SUPER_ADMIN sees all companies
    } 
    else if (user.role === 'ADMIN' || user.role === 'HR') {
      // For ADMIN/HR, companyId is REQUIRED (from company switcher)
      if (!companyId) {
        return withCors(
          ApiResponse.error(
            'Company ID is required. Please select a company from the company switcher.',
            400
          ),
          origin
        )
      }

      // Verify user has access to this company via user_companies table
      const userAssignments = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          role: user.role === 'HR' ? 'HR' : { in: ['ADMIN', 'HR'] },
          companyId: companyId,
          company: { archived: 0 }
        },
        select: { companyId: true }
      })

      if (userAssignments.length === 0) {
        return withCors(
          ApiResponse.error(
            `You don't have ${user.role} access to this company. Please select a different company.`,
            403
          ),
          origin
        )
      }

      where.companyId = companyId
    }
    else if (user.role === 'MANAGER') {
      // MANAGER: Use companyId from query or fallback to token
      const effectiveCompanyId = companyId || user.companyId
      
      if (!effectiveCompanyId) {
        return withCors(
          ApiResponse.error(
            'Company ID is required. Please select a company.',
            400
          ),
          origin
        )
      }

      where.companyId = effectiveCompanyId
      
      // Managers can only see staff in their department
      const managerStaff = await prisma.staffRecord.findUnique({
        where: { id: user.userId },
        select: { department: true }
      })
      
      if (managerStaff?.department) {
        where.department = managerStaff.department
      }
    }

    // Add active/inactive filter
    if (!includeInactive) {
      where.isActive = true
    }

    // Department filter (overrides manager's department filter if explicitly provided)
    if (department) {
      where.department = { contains: department, mode: 'insensitive' }
    }

    // Search functionality
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Execute queries in parallel
    const [staffRecords, totalCount] = await Promise.all([
      prisma.staffRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          staffId: true,
          email: true,
          firstName: true,
          lastName: true,
          department: true,
          position: true,
          phone: true,
          role: true,
          isActive: true,
          isRegistered: true,
          createdAt: true,
          companyId: true,
          company: {
            select: {
              id: true,
              companyName: true,
              archived: true
            }
          }
        },
      }),
      prisma.staffRecord.count({ where }),
    ])

    // Get active/inactive counts
    let activeCount = 0
    let inactiveCount = 0
    
    if (includeInactive) {
      const activeWhere = { ...where, isActive: true }
      const inactiveWhere = { ...where, isActive: false }
      
      activeCount = await prisma.staffRecord.count({ where: activeWhere })
      inactiveCount = await prisma.staffRecord.count({ where: inactiveWhere })
    } else {
      activeCount = totalCount
      inactiveCount = 0
    }

    // Get current company info for response
    let currentCompany = null
    const effectiveCompanyId = companyId || user.companyId
    if (effectiveCompanyId) {
      const company = await prisma.company.findUnique({
        where: { id: effectiveCompanyId, archived: 0 },
        select: { id: true, companyName: true, email: true, phone: true }
      })
      if (company) {
        currentCompany = company
      }
    }

    // Format response
    const formattedStaffRecords = staffRecords.map(record => ({
      id: record.id,
      staffId: record.staffId,
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      fullName: `${record.firstName} ${record.lastName}`,
      department: record.department,
      position: record.position,
      phone: record.phone,
      role: record.role,
      isActive: record.isActive,
      isRegistered: record.isRegistered,
      createdAt: record.createdAt,
      companyId: record.companyId,
      companyName: record.company?.companyName || 'Unknown',
      status: record.isActive ? 'Active' : 'Inactive'
    }))

    return withCors(
      ApiResponse.success({
        staffRecords: formattedStaffRecords,
        currentCompany,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        counts: {
          active: activeCount,
          inactive: inactiveCount,
          total: activeCount + inactiveCount
        },
        filters: {
          includeInactive,
          showing: includeInactive ? 'ALL_STAFF' : 'ACTIVE_ONLY',
          companyId: effectiveCompanyId || null,
          department: department || null,
          search: search || null
        },
        meta: {
          accessLevel: user.role,
          requiresCompanySelection: (user.role === 'ADMIN' || user.role === 'HR') && !companyId,
        }
      }),
      origin
    )
  } catch (error) {
    console.error('[STAFF_RECORDS] Error:', error)
    return withCors(
      handleApiError(error),
      origin
    )
  }
}