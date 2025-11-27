// src/app/api/auth/me/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function GET(request: NextRequest) {
  try {
    // Enforce presence of Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return ApiResponse.error('Authorization header missing', 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded = requireAuth(token) // { userId, email, role, companyId? }

    // You’re using StaffRecord as your “user” model
    const staff = await prisma.staffRecord.findFirst({
      where: {
        id: decoded.userId,
        // if companyId is in the token, enforce it for multi-company safety
        ...(decoded.companyId ? { companyId: decoded.companyId } : {}),
      },
      include: {
        company: true,
      },
    })

    if (!staff) {
      return ApiResponse.error('User not found', 404)
    }

    return ApiResponse.success({
      user: {
        id: staff.id,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
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
    })
  } catch (error) {
    return handleApiError(error)
  }
}
