// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { requireRole, signToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Only SUPER_ADMIN can create/activate login accounts
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
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
      companyId,  // optional; defaults to admin.companyId
      staffId,    // optional; we'll auto-generate if missing
    } = body || {}

    if (!email || !firstName || !lastName) {
      return withCors(
        ApiResponse.error(
          'email, firstName, and lastName are required',
          400
        ),
        origin
      )
    }

    if (!password) {
      return withCors(
        ApiResponse.error(
          'password is required for admin/HR creation',
          400
        ),
        origin
      )
    }

    const targetCompanyId = companyId || admin.companyId
    if (!targetCompanyId) {
      return withCors(
        ApiResponse.error(
          'No company assigned for this user',
          400
        ),
        origin
      )
    }

    const cleanEmail = email.toLowerCase().trim()

    // 1) Check if a StaffRecord already exists for this email + company
    const existing = await prisma.staffRecord.findFirst({
      where: {
        email: cleanEmail,
        companyId: targetCompanyId,
      },
    })

    const hashed = await bcrypt.hash(password, 10)

    let staffRecord

    if (existing) {
      // If already fully registered with a password, block duplicate creation
      if (existing.isRegistered && existing.password) {
        return withCors(
          ApiResponse.error(
            'User already exists in this company',
            409
          ),
          origin
        )
      }

      // Otherwise, "activate" this existing staff record with login credentials
      staffRecord = await prisma.staffRecord.update({
        where: {
          id: existing.id,
        },
        data: {
          password: hashed,
          isRegistered: true,
          isActive: true,
          role,
          // optionally refresh profile details
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          department: department || existing.department,
          position: position || existing.position,
        },
      })
    } else {
      // 2) No existing staff record: create a new one
      const generatedStaffId =
        staffId ||
        `ADM-${Date.now().toString(36).toUpperCase()}`

      staffRecord = await prisma.staffRecord.create({
        data: {
          staffId: generatedStaffId,
          email: cleanEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          department: (department || 'Administration').trim(),
          position: (position || role).trim(),
          password: hashed,
          isRegistered: true,
          isActive: true,
          role,
          companyId: targetCompanyId,
        },
      })
    }

    const jwtToken = signToken({
      userId: staffRecord.id,
      email: staffRecord.email,
      role: staffRecord.role,
      companyId: staffRecord.companyId,
    })

    return withCors(
      ApiResponse.success(
        {
          token: jwtToken,
          user: {
            id: staffRecord.id,
            email: staffRecord.email,
            firstName: staffRecord.firstName,
            lastName: staffRecord.lastName,
            role: staffRecord.role,
            companyId: staffRecord.companyId,
            staffId: staffRecord.staffId,
            department: staffRecord.department,
            position: staffRecord.position,
          },
        },
        'User registered successfully',
        201
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
