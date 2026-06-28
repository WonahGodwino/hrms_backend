// src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getEnabledModules } from '@/app/lib/module-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Enforce presence of Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded = requireAuth(token) // { userId, email, role, companyId? }

    // using StaffRecord
    const staff = await prisma.staffRecord.findFirst({
      where: {
        id: decoded.userId,
        ...(decoded.companyId ? { companyId: decoded.companyId } : {}),
      },
      include: { company: true },
    })

    if (!staff) {
      return withCors(ApiResponse.error('User not found', 404), origin)
    }

    const [enabledModules, phedRoleGrant] = await Promise.all([
      decoded.role === 'SUPER_ADMIN'
        ? getEnabledModules(undefined)
        : getEnabledModules(staff.companyId),
      prisma.phedStaffAccessRole.findUnique({
        where: { staffRecordId: staff.id },
        select: { accessRole: true },
      }),
    ])

    return withCors(
      ApiResponse.success({
        user: {
          id: staff.id,
          email: staff.email,
          firstName: staff.firstName,
          lastName: staff.lastName,
          role: phedRoleGrant?.accessRole ?? staff.role,
          phedAccessRole: phedRoleGrant?.accessRole ?? null,
          companyId: staff.companyId,
          department: staff.department,
          position: staff.position,
          isActive: staff.isActive,
          staffId: staff.staffId,
        },
        company: staff.company
          ? {
              id: staff.company.id,
              companyName: staff.company.companyName,
              email: staff.company.email,
              phone: staff.company.phone,
              address: staff.company.address,
            }
          : null,
        enabledModules,
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
