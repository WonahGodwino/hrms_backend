// src/app/api/auth/complete-registration/route.ts
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
    const { email, staffId, password, companyId } = body || {}

    if (!email || !staffId || !password) {
      return withCors(
        ApiResponse.error(
          'email, staffId, and password are required',
          400
        ),
        origin
      )
    }

    const cleanEmail = email.toLowerCase().trim()
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
        include: { company: true },
      })
    } else {
      const matches = await prisma.staffRecord.findMany({
        where: { staffId: cleanStaffId },
        include: { company: true },
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
        isActive: true,
      },
      include: { company: true },
    })

    const token = signToken({
      userId: updatedStaff.id,
      email: updatedStaff.email,
      role: updatedStaff.role || updatedStaff.position,
      companyId: updatedStaff.companyId,
    })

    return withCors(
      ApiResponse.success(
        {
          token,
          user: {
            id: updatedStaff.id,
            staffId: updatedStaff.staffId,
            email: updatedStaff.email,
            firstName: updatedStaff.firstName,
            lastName: updatedStaff.lastName,
            role: updatedStaff.role || updatedStaff.position,
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
