// src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

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
        // if companyId is in the token, enforce it for multi-company safety
        ...(decoded.companyId ? { companyId: decoded.companyId } : {}),
      },
      include: {
        company: true,
      },
    })

    if (!staff) {
      return withCors(
        ApiResponse.error('User not found', 404),
        origin
      )
    }

    return withCors(
      ApiResponse.success({
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
