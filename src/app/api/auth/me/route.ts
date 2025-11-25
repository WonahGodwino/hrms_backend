// src/app/api/auth/me/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') || null
    const decoded = requireAuth(token)

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        companyId: decoded.companyId,
      },
      include: { company: true },
    })

    if (!user) {
      return ApiResponse.error('User not found', 404)
    }

    return ApiResponse.success({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        department: user.department,
        position: user.position,
        isActive: user.isActive,
      },
      company: user.company,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
