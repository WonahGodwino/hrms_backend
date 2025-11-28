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
      // If frontend passes companyId, we use it directly
      staff = await prisma.staffRecord.findUnique({
        where: {
          email_companyId: {
            email: cleanEmail,
            companyId: companyId.toString(),
          },
        },
      })
    } else {
      // No companyId: find by email only
      const matches = await prisma.staffRecord.findMany({
        where: { email: cleanEmail },
      })

      if (matches.length === 0) {
        // Email not found anywhere → generic invalid credentials
        return ApiResponse.error('Invalid credentials', 401)
      }

      if (matches.length > 1) {
        // Same email in multiple companies: do NOT reveal that
        // Just treat it as invalid credentials
        return ApiResponse.error('Invalid credentials', 401)
      }

      staff = matches[0]
    }

    if (!staff) {
      return ApiResponse.error('Invalid credentials', 401)
    }

    if (!staff.isActive) {
      return ApiResponse.error('Account is deactivated', 403)
    }

    // Enforce registration only for STAFF, not for SUPER_ADMIN / HR
    if (staff.role === 'STAFF' && !staff.isRegistered) {
      return ApiResponse.error('Complete registration before login', 403)
    }

    // Guard nullable password (String? in schema)
    if (!staff.password) {
      // For safety, don’t leak that the account exists but has no password
      return ApiResponse.error('Invalid credentials', 401)
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

    // Fetch company using companyId
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
