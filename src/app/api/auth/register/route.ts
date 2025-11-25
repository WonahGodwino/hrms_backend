// src/app/api/auth/register/route.ts
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { requireRole, signToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') || null
    const admin = requireRole(token, ['SUPER_ADMIN'])

    const body = await request.json()
    const {
      email,
      password,
      firstName,
      lastName,
      role = 'HR',
      department = '',
      position = '',
      companyId, // optional; defaults to admin.companyId
    } = body || {}

    if (!email || !firstName || !lastName) {
      return ApiResponse.error('email, firstName, and lastName are required', 400)
    }

    const targetCompanyId = companyId || admin.companyId
    if (!targetCompanyId) {
      return ApiResponse.error('No company assigned for this user', 400)
    }

    const existing = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), companyId: targetCompanyId },
    })
    if (existing) {
      return ApiResponse.error('User already exists in this company', 409)
    }

    if (!password) {
      return ApiResponse.error('password is required for admin/HR creation', 400)
    }

    const hashed = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashed,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        department,
        position,
        isActive: true,
        isRegistered: true,
        companyId: targetCompanyId,
        createdBy: admin.userId, // if your model has it
      } as any,
    })

    const jwtToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    })

    return ApiResponse.success(
      {
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId,
        },
      },
      'User registered successfully',
      201
    )
  } catch (error) {
    return handleApiError(error)
  }
}
