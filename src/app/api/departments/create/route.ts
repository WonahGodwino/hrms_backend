// src/app/api/departments/create/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateCompanyAccess, logDepartmentAction } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])
    const body = await request.json()
    
    const { name, code, businessUnit, companyId, headId, assistantHeadId } = body
    
    if (!name || !code || !companyId) {
      return withCors(ApiResponse.error('Missing required fields: name, code, companyId', 400), origin)
    }
    
    const hasAccess = await validateCompanyAccess(user, companyId)
    if (!hasAccess && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin)
    }
    
    const existingDepartment = await prisma.department.findFirst({
      where: { companyId, code }
    })
    
    if (existingDepartment) {
      return withCors(ApiResponse.error('Department with this code already exists', 400), origin)
    }
    
    if (headId) {
      const headStaff = await prisma.staffRecord.findFirst({
        where: { id: headId, companyId, isActive: true }
      })
      if (!headStaff) {
        return withCors(ApiResponse.error('Invalid headId: Staff not found or not active', 400), origin)
      }
    }
    
    if (assistantHeadId) {
      const assistantHeadStaff = await prisma.staffRecord.findFirst({
        where: { id: assistantHeadId, companyId, isActive: true }
      })
      if (!assistantHeadStaff) {
        return withCors(ApiResponse.error('Invalid assistantHeadId: Staff not found or not active', 400), origin)
      }
    }
    
    const department = await prisma.department.create({
      data: {
        name,
        code,
        businessUnit: businessUnit || null,
        companyId,
        headId: headId || null,
        assistantHeadId: assistantHeadId || null,
        status: 'Active',
        activeHeadcount: 0
      },
      include: {
        head: { select: { firstName: true, lastName: true } },
        assistantHead: { select: { firstName: true, lastName: true } }
      }
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
      department.id,
      companyId,
      `Created department: ${name} (${code})`,
      user.userId,
      userName,
      'create',
      { name, code, businessUnit, headId, assistantHeadId }
    )
    
    return withCors(ApiResponse.success({ 
      status: 'success',
      message: 'Department created successfully',
      data: department 
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}