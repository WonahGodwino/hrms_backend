// src/app/api/auth/complete-registration/route.ts
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { signToken } from '@/app/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, staffId, password, companyId } = body || {}

    if (!email || !staffId || !password) {
      return ApiResponse.error('email, staffId, and password are required', 400)
    }

    const cleanEmail = email.toLowerCase().trim()
    const cleanStaffId = staffId.toString().trim()

    // Multi-company safe staff lookup:
    // - if companyId is provided, use composite unique
    // - if not, resolve. if multiple matches, force companyId.
    let staffRecord = null as any

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
        return ApiResponse.error('Staff record not found. Contact HR.', 404)
      }

      if (matches.length > 1) {
        return ApiResponse.error(
          'This staffId exists in multiple companies. Please include companyId to complete registration.',
          400
        )
      }

      staffRecord = matches[0]
    }

    if (!staffRecord) {
      return ApiResponse.error('Staff record not found. Contact HR.', 404)
    }

    if (staffRecord.email.toLowerCase().trim() !== cleanEmail) {
      return ApiResponse.error('Email does not match staff record', 403)
    }

    if (!staffRecord.companyId) {
      return ApiResponse.error('Staff has no company assigned. Contact HR.', 400)
    }

    if (staffRecord.isRegistered) {
      return ApiResponse.error('Registration already completed. Please login.', 409)
    }

    const hashed = await bcrypt.hash(password, 10)

    // Update StaffRecord directly (no User model)
    const updatedStaff = await prisma.staffRecord.update({
      where: { id: staffRecord.id },
      data: {
        password: hashed,          // assumes StaffRecord has `password`
        isRegistered: true,        // assumes StaffRecord has `isRegistered`
        isActive: true,
      } as any,
      include: { company: true },
    })

    const token = signToken({
      userId: updatedStaff.id,
      email: updatedStaff.email,
      role: updatedStaff.role || updatedStaff.position, // use role if you added it, else position
      companyId: updatedStaff.companyId,
    })

    return ApiResponse.success(
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
    )
  } catch (error) {
    return handleApiError(error)
  }
}
