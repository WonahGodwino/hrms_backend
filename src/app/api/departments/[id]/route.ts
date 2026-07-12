// src/app/api/departments/[id]/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess, logDepartmentAction } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    
    const department = await prisma.department.findUnique({
      where: { id: params.id },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        assistantHead: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, companyName: true } }
      }
    })

    if (!department) {
      return withCors(ApiResponse.error('Department not found', 404), origin)
    }

    const hasAccess = await validateCompanyAccess(user, department.companyId)
    if (!hasAccess && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin)
    }

    return withCors(ApiResponse.success({ data: department }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
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
    
    const department = await getDepartmentWithAccess(user, params.id)
    
    const body = await request.json()
    const updateData: any = {}
    const updatedFields: string[] = []
    
    const allowedFields = ['name', 'code', 'businessUnit', 'headId', 'assistantHeadId', 'maxHeadcount', 'costCenter', 'budgetCode']
    
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key]
        updatedFields.push(key)
      }
    }
    
    updateData.updatedAt = new Date()

    // Enforce per-company, case-insensitive name uniqueness with a friendly
    // message (a rename to an existing name — regardless of case — would
    // otherwise hit the lower(name) unique index).
    if (updateData.name !== undefined) {
      const clash = await prisma.department.findFirst({
        where: {
          companyId: department.companyId,
          name: { equals: updateData.name, mode: 'insensitive' },
          NOT: { id: params.id },
        },
        select: { id: true },
      })
      if (clash) {
        return withCors(ApiResponse.error('A department with this name already exists', 400), origin)
      }
    }

    if (updateData.headId) {
      const headStaff = await prisma.staffRecord.findFirst({
        where: { id: updateData.headId, companyId: department.companyId, isActive: true }
      })
      if (!headStaff) {
        return withCors(ApiResponse.error('Invalid headId: Staff not found or not active', 400), origin)
      }
    }

    if (updateData.assistantHeadId) {
      const assistantHeadStaff = await prisma.staffRecord.findFirst({
        where: { id: updateData.assistantHeadId, companyId: department.companyId, isActive: true }
      })
      if (!assistantHeadStaff) {
        return withCors(ApiResponse.error('Invalid assistantHeadId: Staff not found or not active', 400), origin)
      }
    }

    const updatedDepartment = await prisma.department.update({
      where: { id: params.id, companyId: department.companyId },
      data: updateData,
      include: {
        head: { select: { id: true, firstName: true, lastName: true } },
        assistantHead: { select: { id: true, firstName: true, lastName: true } }
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
      params.id,
      department.companyId,
      `Updated department fields: ${updatedFields.join(', ')}`,
      user.userId,
      userName,
      'edit',
      { updatedFields, changes: updateData }
    )

    return withCors(ApiResponse.success({
      status: 'success',
      message: 'Department updated successfully.',
      data: updatedDepartment
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