// src/app/api/departments/staff/update/[id]/position/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffDepartmentChange, logDepartmentAction } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])
    
    const body = await request.json()
    
    if (!body.newPosition) {
      return withCors(ApiResponse.error('newPosition is required', 400), origin)
    }
    
    const staff = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { 
        position: true, 
        departmentId: true, 
        companyId: true,
        firstName: true,
        lastName: true
      }
    })
    
    if (!staff) {
      return withCors(ApiResponse.error('Staff not found', 404), origin)
    }
    
    const hasAccess = await validateCompanyAccess(user, staff.companyId)
    if (!hasAccess && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin)
    }
    
    const oldPosition = staff.position
    
    const updated = await prisma.staffRecord.update({
      where: { id: params.id },
      data: { position: body.newPosition }
    })
    
    await logStaffDepartmentChange(
      params.id,
      staff.departmentId,
      staff.departmentId,
      oldPosition,
      body.newPosition,
      user.userId,
      body.reason
    )
    
    if (staff.departmentId) {
      // Fetch user's name for audit log
      const userRecord = await prisma.staffRecord.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, email: true }
      })
      const userName = userRecord
        ? `${userRecord.firstName} ${userRecord.lastName}`
        : user.email || user.userId
      await logDepartmentAction(
        staff.departmentId,
        staff.companyId,
        `Updated staff ${staff.firstName} ${staff.lastName} position from "${oldPosition}" to "${body.newPosition}"`,
        user.userId,
        userName,
        'staff_change',
        { staffId: params.id, oldPosition, newPosition: body.newPosition }
      )
    }
    
    return withCors(ApiResponse.success({ 
      status: 'success', 
      message: 'Staff position updated successfully.',
      data: { staffId: params.id, oldPosition, newPosition: body.newPosition }
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

async function validateCompanyAccess(user: any, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  
  const userCompany = await prisma.userCompany.findFirst({
    where: {
      userId: user.userId,
      companyId: companyId,
      role: { in: [user.role, 'ALL'] }
    }
  })
  
  return !!userCompany
}