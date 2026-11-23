// src/app/api/auth/complete-registration/route.ts
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { signToken } from '@/app/lib/auth'
import { signRefreshToken } from '@/app/lib/auth/refresh-token'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { syncUserCompanyForRole } from '@/app/lib/access/user-company-role'
import { verifyRegistrationToken } from '@/app/lib/auth/registration-token'
import { phedAccountRateLimit, phedRateLimit } from '@/app/lib/phed/rate-limit'
import { readJsonBodyOrEmpty } from '@/app/lib/validation/request-body'
import { completeRegistrationBodySchema } from '@/app/lib/validation/auth-schemas'

const INVALID_INVITE_MESSAGE =
  'This setup link is invalid or has expired. Request a new link from the registration page or ask HR to resend your invite.'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  // SEC-010: per-IP limit (the proxy-added address, not the client-supplied one).
  const ipLimited = phedRateLimit(request, 'auth')
  if (ipLimited) return withCors(ipLimited, origin)

  try {
    // API-002: fields are type-checked; a malformed body falls into the checks below.
    const { email, staffId, password, companyId, invite } = await readJsonBodyOrEmpty(request, completeRegistrationBodySchema)

    if (!email || !staffId || !password) {
      return withCors(
        ApiResponse.error(
          'email, staffId, and password are required',
          400
        ),
        origin
      )
    }

    // SEC-002: registration needs the signed invite from the setup e-mail.
    const invitation = verifyRegistrationToken(invite)
    if (!invitation) {
      return withCors(
        ApiResponse.error(INVALID_INVITE_MESSAGE, 403),
        origin
      )
    }

    const cleanEmail = email.toLowerCase().trim()

    // SEC-010: per-account limit, so rotating IP addresses does not help.

    const accountLimited = phedAccountRateLimit(request, 'auth', cleanEmail)

    if (accountLimited) return withCors(accountLimited, origin)

    const cleanStaffId = staffId.toString().trim()

    // Multi-company safe staff lookup:
    // - if companyId is provided, use composite unique
    // - if not, resolve. if multiple matches, force companyId.
    let staffRecord: any = null

    if (companyId) {
      staffRecord = await prisma.staffRecord.findUnique({
        where: {
          staffId_companyId: {
            staffId: cleanStaffId,
            companyId: companyId.toString(),
          },
        },
      })
    } else {
      const matches = await prisma.staffRecord.findMany({
        where: { staffId: cleanStaffId },
      })

      if (matches.length === 0) {
        return withCors(
          ApiResponse.error('Staff record not found. Contact HR.', 404),
          origin
        )
      }

      if (matches.length > 1) {
        return withCors(
          ApiResponse.error(
            'This staffId exists in multiple companies. Please include companyId to complete registration.',
            400
          ),
          origin
        )
      }

      staffRecord = matches[0]
    }

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('Staff record not found. Contact HR.', 404),
        origin
      )
    }

    if (
      staffRecord.id !== invitation.staffRecordId ||
      staffRecord.email.toLowerCase().trim() !== invitation.email ||
      staffRecord.companyId !== invitation.companyId
    ) {
      return withCors(
        ApiResponse.error(INVALID_INVITE_MESSAGE, 403),
        origin
      )
    }

    if (staffRecord.email.toLowerCase().trim() !== cleanEmail) {
      return withCors(
        ApiResponse.error('Email does not match staff record', 403),
        origin
      )
    }

    if (!staffRecord.companyId) {
      return withCors(
        ApiResponse.error(
          'Staff has no company assigned. Contact HR.',
          400
        ),
        origin
      )
    }

    if (staffRecord.isRegistered) {
      return withCors(
        ApiResponse.error(
          'Registration already completed. Please login.',
          409
        ),
        origin
      )
    }

    const hashed = await bcrypt.hash(password, 10)

    const updatedStaff = await prisma.staffRecord.update({
      where: { id: staffRecord.id },
      data: {
        password: hashed,
        isRegistered: true,
      },
      include: { company: { select: { id: true, companyName: true, email: true, phone: true, address: true } } },
    })

    // Safety net: an invited HR/ADMIN completing registration must have the
    // company-access link their elevated access resolves from. No-op for STAFF.
    try {
      await syncUserCompanyForRole(prisma, {
        userId: updatedStaff.id,
        companyId: updatedStaff.companyId,
        role: updatedStaff.role,
        actorEmail: updatedStaff.email,
      })
    } catch (err) {
      console.error('Failed to sync company access on registration:', err)
    }

    const token = signToken({
      userId: updatedStaff.id,
      email: updatedStaff.email,
      role: updatedStaff.role || 'STAFF',
      companyId: updatedStaff.companyId,
    })

    return withCors(
      ApiResponse.success(
        {
          token,
          refreshToken: signRefreshToken({ userId: updatedStaff.id }),
          user: {
            id: updatedStaff.id,
            staffId: updatedStaff.staffId,
            email: updatedStaff.email,
            firstName: updatedStaff.firstName,
            lastName: updatedStaff.lastName,
            role: updatedStaff.role || 'STAFF',
            companyId: updatedStaff.companyId,
            department: updatedStaff.department,
            position: updatedStaff.position,
          },
          company: updatedStaff.company
            ? {
                id: updatedStaff.company.id,
                companyName: updatedStaff.company.companyName,
                email: updatedStaff.company.email,
                phone: updatedStaff.company.phone,
                address: updatedStaff.company.address,
              }
            : null,
        },
        'Registration completed successfully'
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
