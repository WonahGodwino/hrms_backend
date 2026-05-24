// src/app/api/departments/[id]/reactivate/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess, logDepartmentAction } from '@/app/lib/departments/department-utils'

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
    
    const department = await getDepartmentWithAccess(user, params.id)
    
    if (department.status === 'Active') {
      return withCors(ApiResponse.error('Department is already active', 400), origin)
    }
    
    const body = await request.json().catch(() => ({}))
    
    await prisma.department.update({ 
      where: { id: params.id, companyId: department.companyId }, 
      data: { status: 'Active' } 
    })

    // Fetch user's name for audit log
    const userRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true, email: true }
    })
    const userName = userRecord
      ? `${userRecord.firstName} ${userRecord.lastName}`
      : user.email || user.userId
    await logDepartmentAction(
      params.id,
      department.companyId,
      `Reactivated department${body.reason ? `: ${body.reason}` : ''}`,
      user.userId,
      userName,
      'reactivate',
      { reason: body.reason || null }
    )

    return withCors(ApiResponse.success({
      status: 'success',
      message: 'Department successfully reactivated.',
      data: { id: params.id, status: 'Active' }
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}