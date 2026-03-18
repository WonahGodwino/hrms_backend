// src/app/api/profile/payslips/route.ts
//staff profile payslip
// src/app/api/profile/payslips/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { PayslipItem, StaffRecordInfo } from '@/app/lib/types/payslip'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireAuth(token)

    // STAFF only endpoint - reject others
    if (user.role !== 'STAFF') {
      return withCors(
        ApiResponse.error('This endpoint is for staff members only', 403),
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

    // Parse query parameters for filtering
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    // Build where clause - always filter by staffRecordId
    const whereClause: any = {
      staffRecordId: user.userId,
      companyId: companyId,
    }

    // Add year/month filters if provided
    if (year) {
      whereClause.year = parseInt(year)
    }
    if (month) {
      whereClause.month = month
    }

    // Get total count for pagination
    const totalCount = await prisma.payslip.count({
      where: whereClause,
    })

    // Fetch payslips with pagination
    const payslips = await prisma.payslip.findMany({
      where: whereClause,
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
    })

    // Get staff info
    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: {
        staffId: true,
        email: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
      }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('Staff record not found', 404),
        origin
      )
    }

    // Transform the data
    const items: PayslipItem[] = payslips.map((p: any) => ({
      id: p.id,
      month: p.month,
      year: p.year,
      grossPay: p.grossPay ? p.grossPay.toString() : null,
      netPay: p.netPay ? p.netPay.toString() : null,
      createdAt: p.createdAt,
      fileName: p.fileName,
      downloadUrl: `/api/payslips/${p.id}/download`,
    }))

    const staffInfo: StaffRecordInfo = {
      id: user.userId,
      staffId: staffRecord.staffId,
      name: `${staffRecord.firstName} ${staffRecord.lastName}`,
      email: staffRecord.email,
      department: staffRecord.department,
      position: staffRecord.position,
    }

    return withCors(
      ApiResponse.success(
        {
          staff: staffInfo,
          payslips: items,
          pagination: {
            total: totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
          },
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