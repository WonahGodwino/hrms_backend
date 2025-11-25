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
      return ApiResponse.error('email and password are required', 400)
    }

    const cleanEmail = email.toLowerCase().trim()

    // multi-company safe lookup:
    // - if companyId is provided, use composite unique
    // - if not provided, try to resolve. if multiple companies share same email, force companyId.
    let staff = null

    if (companyId) {
      staff = await prisma.staffRecord.findUnique({
        where: {
          email_companyId: {
            email: cleanEmail,
            companyId: companyId.toString(),
          },
        },
        include: { company: true },
      })
    } else {
      const matches = await prisma.staffRecord.findMany({
        where: { email: cleanEmail },
        include: { company: true },
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

    if (!staff) return ApiResponse.error('Invalid credentials', 401)
    if (!staff.isActive) return ApiResponse.error('Account is deactivated', 403)
    if (!staff.isRegistered) {
      return ApiResponse.error('Complete registration before login', 403)
    }

    // NOTE: field assumed as staff.password (hashed)
    const ok = await bcrypt.compare(password, staff.password)
    if (!ok) return ApiResponse.error('Invalid credentials', 401)

    const token = signToken({
      userId: staff.id,
      email: staff.email,
      role: staff.role, // or staff.role if you added a role field
      companyId: staff.companyId,
    })

    return ApiResponse.success({
      token,
      user: {
        id: staff.id,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role, // or staff.role
        companyId: staff.companyId,
        department: staff.department,
        position: staff.position,
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
