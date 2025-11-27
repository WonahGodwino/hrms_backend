// src/app/api/auth/login/route.ts
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { signToken } from '@/app/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, companyId } = body || {}

    if (!email || !password) {
      return ApiResponse.error('Email and password are required', 400)
    }

    const cleanEmail = email.toLowerCase().trim()

    // Multi-company safe lookup
    let staff = null

    if (companyId) {
      staff = await prisma.staffRecord.findUnique({
        where: {
          email_companyId: {
            email: cleanEmail,
            companyId: companyId.toString(),
          },
        },
      })
    } else {
      const matches = await prisma.staffRecord.findMany({
        where: { email: cleanEmail },
      })

      if (matches.length === 0) {
        return ApiResponse.error('Invalid credentials', 401)
      }

      if (matches.length > 1) {
        return ApiResponse.error(
          'This email exists in multiple companies. Please include companyId to login.',
          400
        )
      }

      staff = matches[0]
    }

    if (!staff) {
      return ApiResponse.error('Invalid credentials', 401)
    }

    if (!staff.isActive) {
      return ApiResponse.error('Account is deactivated', 403)
    }

    if (!staff.isRegistered) {
      return ApiResponse.error('Complete registration before login', 403)
    }

    // Guard nullable password (String? in schema)
    if (!staff.password) {
      return ApiResponse.error(
        'Account is not fully set up. Please complete registration.',
        400
      )
    }

    const ok = await bcrypt.compare(password, staff.password)
    if (!ok) {
      return ApiResponse.error('Invalid credentials', 401)
    }

    const token = signToken({
      userId: staff.id,
      email: staff.email,
      role: staff.role,
      companyId: staff.companyId,
    })

    // Fetch company separately using companyId (avoids TS issues with include)
    const company = await prisma.company.findUnique({
      where: { id: staff.companyId },
    })

    return ApiResponse.success(
      {
        token,
        user: {
          id: staff.id,
          email: staff.email,
          firstName: staff.firstName,
          lastName: staff.lastName,
          role: staff.role,
          companyId: staff.companyId,
          department: staff.department,
          position: staff.position,
          staffId: staff.staffId,
        },
        company: company
          ? {
              id: company.id,
              companyName: company.companyName,
              email: company.email,
              phone: company.phone,
              address: company.address,
            }
          : null,
      },
      'Login successful'
    )
  } catch (error) {
    return handleApiError(error)
  }
}
