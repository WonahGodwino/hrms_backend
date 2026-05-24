// src/app/api/departments/[id]/deactivate/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess, logDepartmentAction, logStaffDepartmentChange } from '@/app/lib/departments/department-utils'

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

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])
    
    // Fetch the actual user record to get firstName and lastName
    const userRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true, email: true }
    })
    
    const userName = userRecord 
      ? `${userRecord.firstName} ${userRecord.lastName}`
      : user.email || user.userId
    
    const department = await getDepartmentWithAccess(user, params.id)
    
    if (department.status === 'Inactive') {
      return withCors(ApiResponse.error('Department is already inactive', 400), origin)
    }
    
    const body = await request.json()
    
    const staffCount = await prisma.staffRecord.count({ 
      where: { departmentId: params.id, companyId: department.companyId, isActive: true }
    })
    
    if (staffCount > 0 && !body.transferToDepartmentId) {
      return withCors(ApiResponse.error('transferToDepartmentId is required for departments with active staff', 400), origin)
    }

    let transferMessage = ''
    if (body.transferToDepartmentId) {
      const targetDepartment = await prisma.department.findFirst({
        where: { id: body.transferToDepartmentId, companyId: department.companyId, status: 'Active' }
      })
      
      if (!targetDepartment) {
        return withCors(ApiResponse.error('Invalid transferToDepartmentId: Department not found or inactive', 400), origin)
      }
      
      const staffToTransfer = await prisma.staffRecord.findMany({
        where: { departmentId: params.id, companyId: department.companyId, isActive: true },
        select: { id: true, position: true }
      })
      
      for (const staff of staffToTransfer) {
        await prisma.staffRecord.update({
          where: { id: staff.id },
          data: { departmentId: body.transferToDepartmentId }
        })
        
        await logStaffDepartmentChange(
          staff.id,
          params.id,
          body.transferToDepartmentId,
          staff.position,
          staff.position,
          user.userId,
          'Department deactivation - automatic transfer'
        )
      }
      
      transferMessage = ` and ${staffCount} staff members transferred to ${targetDepartment.name}`
    }

    await prisma.department.update({ 
      where: { id: params.id, companyId: department.companyId }, 
      data: { status: 'Inactive' } 
    })

    await logDepartmentAction(
      params.id,
      department.companyId,
      `Deactivated department${body.transferToDepartmentId ? ` with staff transferred` : ''}`,
      user.userId,
      userName,
      'deactivate',
      { transferToDepartmentId: body.transferToDepartmentId, staffCount }
    )

    return withCors(ApiResponse.success({ 
      status: 'success', 
      message: `Department deactivated successfully.${transferMessage}` 
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}