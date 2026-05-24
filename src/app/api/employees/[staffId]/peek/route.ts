// src/app/api/employees/[staffId]/peek/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { staffId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])

    const staff = await prisma.staffRecord.findFirst({
      where: { id: params.staffId, isActive: true },
      include: {
        company: { select: { id: true, companyName: true } },
        departments: {  // ← USING THE RELATION NAME WITH 's'
          select: { 
            id: true, 
            name: true,
            code: true
          }
        }
      }
    })

    if (!staff) {
      return withCors(ApiResponse.error('Staff not found', 404), origin)
    }

    const hasAccess = await validateCompanyAccess(user, staff.companyId)
    if (!hasAccess && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin)
    }

    return withCors(ApiResponse.success({
      id: staff.id,
      name: `${staff.firstName} ${staff.lastName}`,
      email: staff.email,
      phone: staff.phone || '',
      location: staff.location || 'Not specified',
      status: staff.isActive ? 'Active' : 'Inactive',
      avatarSrc: staff.avatarUrl || null,
      position: staff.position,
      departmentId: staff.departmentId,  // ← The FK field
      departmentName: staff.departments?.name || 'Unassigned',  // ← Using the relation
      departmentCode: staff.departments?.code  // ← Using the relation
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