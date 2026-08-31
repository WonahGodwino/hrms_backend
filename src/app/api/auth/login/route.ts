// src/app/api/auth/login/route.ts
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { signToken } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { getEnabledModules } from '@/app/lib/module-access'
import { getActiveElevatedRole } from '@/app/lib/role-elevation'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const rl = phedRateLimit(request, 'auth')
  if (rl) return withCors(rl, origin)

  try {
    const body = await request.json()
    const { email, password, companyId } = body || {}

    if (!email || !password) {
      return withCors(ApiResponse.error('Email and password are required', 400), origin)
    }

    const cleanEmail = email.toLowerCase().trim()

    // Multi-company safe lookup — only ever consider active accounts
    const candidates = companyId
      ? await prisma.staffRecord.findMany({
          where: {
            email: cleanEmail,
            companyId: companyId.toString(),
            isActive: true,
          },
        })
      : await prisma.staffRecord.findMany({
          where: { email: cleanEmail, isActive: true },
        })

    if (candidates.length === 0) {
      // No active account for this email (or email/company combo) → generic invalid credentials
      return withCors(ApiResponse.error('Invalid credentials', 401), origin)
    }

    // Same email can exist across multiple companies. Try the password against
    // each candidate and log in to whichever company it actually matches —
    // only fall back to "Invalid credentials" once none of them match.
    let staff = null
    for (const candidate of candidates) {
      if (!candidate.password) continue
      if (await bcrypt.compare(password, candidate.password)) {
        staff = candidate
        break
      }
    }

    if (!staff) {
      return withCors(ApiResponse.error('Invalid credentials', 401), origin)
    }

    // Enforce registration only for STAFF, not for SUPER_ADMIN / HR
    if (staff.role === 'STAFF' && !staff.isRegistered) {
      return withCors(ApiResponse.error('Complete registration before login', 403), origin)
    }

    // Fetch company, enabled modules, PHED access role, and any ACTIVE temporary
    // role-elevation (e.g. staff elevated to HR/ADMIN to sit on an interview panel)
    // in parallel.
    const [company, enabledModules, phedRoleGrant, elevatedRole] = await Promise.all([
      prisma.company.findUnique({
        where: { id: staff.companyId },
        select: { id: true, companyName: true, email: true, phone: true, address: true },
      }),
      staff.role === 'SUPER_ADMIN'
        ? getEnabledModules(undefined)
        : getEnabledModules(staff.companyId),
      prisma.phedStaffAccessRole.findUnique({
        where: { staffRecordId: staff.id },
        select: { accessRole: true },
      }),
      staff.role === 'SUPER_ADMIN' ? null : getActiveElevatedRole(staff.id, staff.companyId),
    ])

    const token = signToken({
      userId: staff.id,
      email: staff.email,
      role: staff.role,
      companyId: staff.companyId,
      enabledModules,
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
            role: phedRoleGrant?.accessRole ?? staff.role,
            phedAccessRole: phedRoleGrant?.accessRole ?? null,
            elevatedRole: elevatedRole || null,
            companyId: staff.companyId,
            department: staff.department,
            position: staff.position,
            staffId: staff.staffId,
            requirePasswordChange: (staff as any).requirePasswordChange ?? false,
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
          enabledModules,
        },
        'Login successful'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
