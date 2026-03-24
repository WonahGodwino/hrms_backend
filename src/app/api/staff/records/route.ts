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
    // Ensure we have an Authorization header and a clean token string
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    // Only HR, SUPER_ADMIN, MANAGER can use this endpoint (STAFF is excluded)
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'MANAGER', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const department = searchParams.get('department')
    const search = searchParams.get('search') // new search query
    const includeInactive = searchParams.get('includeInactive') === 'true' // Optional parameter to include inactive staff

    const skip = (page - 1) * limit

    // Base where clause with company scoping and isActive filter
    const where: any = {
      // Filter for active staff by default (unless includeInactive is true)
      isActive: includeInactive ? undefined : true,
      // Ensure company is not archived
      company: {
        archived: 0
      }
    }

    // If the user is not SUPER_ADMIN, restrict to their companyId
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('No company assigned for this user', 400),
          origin
        )
      }
      where.companyId = user.companyId
    }

    // Department filter if provided
    if (department) {
      where.department = { contains: department, mode: 'insensitive' }
    }

    // Search functionality for firstName, lastName, staffId, and email
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

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
          isActive: true,
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

    // Get active and inactive counts if includeInactive is true
    let activeCount = 0;
    let inactiveCount = 0;
    
    if (includeInactive) {
      // Count active staff
      const activeWhere = { ...where, isActive: true };
      delete activeWhere.isActive; // Remove the conditional
      activeCount = await prisma.staffRecord.count({ 
        where: { ...activeWhere, isActive: true } 
      });
      
      // Count inactive staff
      const inactiveWhere = { ...where, isActive: false };
      delete inactiveWhere.isActive; // Remove the conditional
      inactiveCount = await prisma.staffRecord.count({ 
        where: { ...inactiveWhere, isActive: false } 
      });
    } else {
      activeCount = totalCount;
      inactiveCount = 0;
    }

    // Format the response
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
      isActive: record.isActive,
      createdAt: record.createdAt,
      companyId: record.companyId,
      companyName: record.company?.companyName || 'Unknown',
      status: record.isActive ? 'Active' : 'Inactive'
    }))

    return withCors(
      ApiResponse.success({
        staffRecords: formattedStaffRecords,
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
          showing: includeInactive ? 'ALL_STAFF' : 'ACTIVE_ONLY'
        }
      }),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}