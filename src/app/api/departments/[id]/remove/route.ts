// src/app/api/departments/[id]/remove/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffDepartmentChange, logDepartmentAction } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    
    const user = requireRole(authHeader.replace('Bearer ', ''), ['HR', 'SUPER_ADMIN', 'ADMIN'])
    
    const staff = await prisma.staffRecord.findUnique({ 
      where: { id: params.id },
      select: {
        departmentId: true,
        companyId: true,
        position: true,
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
    
    const oldDepartmentId = staff.departmentId
    
    await prisma.staffRecord.update({
      where: { id: params.id },
      data: { departmentId: null }
    })
    
    await logStaffDepartmentChange(
      params.id,
      oldDepartmentId,
      null,
      staff.position,
      staff.position,
      user.userId,
      'Removed from department'
    )
    
    if (oldDepartmentId) {
      // Fetch user's name for audit log
      const userRecord = await prisma.staffRecord.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, email: true }
      })
      const userName = userRecord
        ? `${userRecord.firstName} ${userRecord.lastName}`
        : user.email || user.userId
      await logDepartmentAction(
        oldDepartmentId,
        staff.companyId,
        `Removed staff ${staff.firstName} ${staff.lastName} from department`,
        user.userId,
        userName,
        'staff_change',
        { staffId: params.id }
      )
    }
    
    return withCors(ApiResponse.success({ 
      status: 'success', 
      message: 'Staff removed from department successfully.' 
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