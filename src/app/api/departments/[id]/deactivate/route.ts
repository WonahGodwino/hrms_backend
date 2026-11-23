// src/app/api/departments/[id]/deactivate/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { buildStaffTransferHistory, getDepartmentWithAccess, logDepartmentAction } from '@/app/lib/departments/department-utils'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    
    const staffCount = await forCompany(department.companyId).staffRecord.count({ 
      where: { departmentId: params.id, isActive: true }
    })
    
    if (staffCount > 0 && !body.transferToDepartmentId) {
      return withCors(ApiResponse.error('transferToDepartmentId is required for departments with active staff', 400), origin)
    }

    let transferMessage = ''
    if (body.transferToDepartmentId) {
      const targetDepartment = await forCompany(department.companyId).department.findFirst({
        where: { id: body.transferToDepartmentId, status: 'Active' }
      })
      
      if (!targetDepartment) {
        return withCors(ApiResponse.error('Invalid transferToDepartmentId: Department not found or inactive', 400), origin)
      }
      
      const staffToTransfer = await forCompany(department.companyId).staffRecord.findMany({
        where: { departmentId: params.id, isActive: true },
        select: { id: true, position: true }
      })
      
      // PERF-001: one update and one history insert for all staff, instead of
      // two queries per staff member. Run together so the move and its
      // history are written all-or-nothing.
      if (staffToTransfer.length > 0) {
        await prisma.$transaction([
          prisma.staffRecord.updateMany({
            where: { id: { in: staffToTransfer.map((s) => s.id) } },
            // Free-text `department` follows the transfer too.
            data: { departmentId: body.transferToDepartmentId, department: targetDepartment.name }
          }),
          prisma.departmentStaffHistory.createMany({
            data: buildStaffTransferHistory(
              staffToTransfer,
              params.id,
              body.transferToDepartmentId,
              department.companyId,
              user.userId,
              'Department deactivation - automatic transfer'
            )
          })
        ])
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