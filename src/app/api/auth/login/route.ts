// src/app/api/auth/login/route.ts
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { signToken } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const body = await request.json()
    const { email, password, companyId } = body || {}

    if (!email || !password) {
      return withCors(
        ApiResponse.error('Email and password are required', 400),
        origin
      )
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
        return withCors(
          ApiResponse.error('Invalid credentials', 401),
          origin
        )
      }

      if (matches.length > 1) {
        // Same email in multiple companies: do NOT reveal that
        // Just treat it as invalid credentials
        return withCors(
          ApiResponse.error('Invalid credentials', 401),
          origin
        )
      }

      staff = matches[0]
    }

    if (!staff) {
      return withCors(
        ApiResponse.error('Invalid credentials', 401),
        origin
      )
    }

    if (!staff.isActive) {
      return withCors(
        ApiResponse.error('Account is deactivated', 403),
        origin
      )
    }

    // Enforce registration only for STAFF, not for SUPER_ADMIN / HR
    if (staff.role === 'STAFF' && !staff.isRegistered) {
      return withCors(
        ApiResponse.error('Complete registration before login', 403),
        origin
      )
    }

    // Guard nullable password (String? in schema)
    if (!staff.password) {
      // For safety, don’t leak that the account exists but has no password
      return withCors(
        ApiResponse.error('Invalid credentials', 401),
        origin
      )
    }

    const ok = await bcrypt.compare(password, staff.password)
    if (!ok) {
      return withCors(
        ApiResponse.error('Invalid credentials', 401),
        origin
      )
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

    return withCors(
      ApiResponse.success(
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
