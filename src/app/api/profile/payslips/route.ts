// src/app/api/profile/payslips/route.ts
// Use this from your staff profile page (e.g., /profile) to show a table or list of payslips.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function GET(request: NextRequest) {
  try {
    // Ensure we always pass a string to requireAuth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return ApiResponse.error('Authorization header missing', 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireAuth(token) // { userId, email, role, companyId }

    // Find the staff record linked to this user by email + company
    const staffRecord = await prisma.staffRecord.findUnique({
      where: {
        email_companyId: {
          email: user.email,
          companyId: user.companyId,
        },
      },
    })

    if (!staffRecord) {
      return ApiResponse.error(
        'Staff record not found for current user',
        404
      )
    }

    const payslips = await prisma.payslip.findMany({
      where: {
        staffRecordId: staffRecord.id,
        companyId: user.companyId,
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    const items = payslips.map((p) => ({
      id: p.id,
      month: p.month,
      year: p.year,
      grossPay: p.grossPay ? p.grossPay.toString() : null,
      netPay: p.netPay ? p.netPay.toString() : null,
      createdAt: p.createdAt,
      fileName: p.fileName,
      downloadUrl: `/api/payslips/${p.id}/download`,
    }))

    return ApiResponse.success(
      {
        staffId: staffRecord.staffId,
        email: staffRecord.email,
        payslips: items,
      },
      'Payslip history fetched successfully'
    )
  } catch (error) {
    return handleApiError(error)
  }
}
