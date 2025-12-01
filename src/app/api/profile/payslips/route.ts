// src/app/api/profile/payslips/route.ts
// Using this from staff profile page (e.g., /profile) to show a table or list of payslips.

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Ensure we always pass a string to requireAuth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    // This is actually your StaffRecord-based auth payload
    const user = requireAuth(token) // { userId, email, role, companyId, ... }

    // SUPER_ADMIN is a system admin, not a staff of a specific company → block here
    if (user.role === 'SUPER_ADMIN') {
      return withCors(
        ApiResponse.error(
          'SUPER_ADMIN users do not have personal payslips',
          403
        ),
        origin
      )
    }

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for current user', 400),
        origin
      )
    }

    const companyId = user.companyId as string

    // Find the staff record linked to this auth payload (no separate User model)
    const staffRecord = await prisma.staffRecord.findFirst({
      where: {
        id: user.userId,      // StaffRecord.id stored in the token
        companyId: companyId, // guaranteed string here
      },
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('Staff record not found for current user', 404),
        origin
      )
    }

    const payslips = await prisma.payslip.findMany({
      where: {
        staffRecordId: staffRecord.id,
        companyId: companyId,
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    const items = payslips.map((p: any) => ({
      id: p.id,
      month: p.month,
      year: p.year,
      grossPay: p.grossPay ? p.grossPay.toString() : null,
      netPay: p.netPay ? p.netPay.toString() : null,
      createdAt: p.createdAt,
      fileName: p.fileName,
      downloadUrl: `/api/payslips/${p.id}/download`,
    }))

    return withCors(
      ApiResponse.success(
        {
          staffId: staffRecord.staffId,
          email: staffRecord.email,
          payslips: items,
        },
        'Payslip history fetched successfully'
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
