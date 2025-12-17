// src/app/api/admin/dashboard/stats/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') || new Date().getFullYear().toString()
    const companyId = searchParams.get('companyId')

    // Build where clause
    const whereClause: any = {
      year: parseInt(year),
    }

    // Company filtering
    if (user.role === 'HR') {
      whereClause.companyId = user.companyId
    } else if (user.role === 'SUPER_ADMIN' && companyId) {
      whereClause.companyId = companyId
    }

    // Get total payslips
    const totalPayslips = await prisma.payslip.count({
      where: whereClause,
    })

    // Get total gross and net pay
    const payslipAggregates = await prisma.payslip.aggregate({
      where: whereClause,
      _sum: {
        grossPay: true,
        netPay: true,
      },
    })

    // Get payslips by month
    const payslipsByMonth = await prisma.payslip.groupBy({
      by: ['month'],
      where: whereClause,
      _count: {
        id: true,
      },
      _sum: {
        grossPay: true,
        netPay: true,
      },
    })

    // Get active staff count
    const activeStaffCount = await prisma.staffRecord.count({
      where: {
        isActive: true,
        companyId: whereClause.companyId || undefined,
      },
    })

    // Get recent payslips
    const recentPayslips = await prisma.payslip.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        staffRecord: {
          select: {
            staffId: true,
            firstName: true,
            lastName: true,
          }
        }
      },
    })

    // Define types
    interface MonthlyData {
      month: string;
      count: number;
      totalGross: string;
      totalNet: string;
    }

    interface RecentPayslip {
      id: string;
      month: string;
      year: number;
      staffName: string;
      staffId: string;
      netPay: string;
      downloadUrl: string;
    }

    // Transform data with proper types
    const monthlyData: MonthlyData[] = payslipsByMonth.map((monthData: any) => ({
      month: monthData.month,
      count: monthData._count.id,
      totalGross: monthData._sum.grossPay?.toString() || '0',
      totalNet: monthData._sum.netPay?.toString() || '0',
    }))

    const recentPayslipsData: RecentPayslip[] = recentPayslips.map((p: any) => ({
      id: p.id,
      month: p.month,
      year: p.year,
      staffName: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`,
      staffId: p.staffRecord.staffId,
      netPay: p.netPay?.toString() || '0',
      downloadUrl: `/api/payslips/${p.id}/download`,
    }))

    return withCors(
      ApiResponse.success(
        {
          year: parseInt(year),
          stats: {
            totalPayslips,
            totalGrossPay: payslipAggregates._sum.grossPay?.toString() || '0',
            totalNetPay: payslipAggregates._sum.netPay?.toString() || '0',
            activeStaffCount,
            averageNetPay: totalPayslips > 0 
              ? (parseFloat(payslipAggregates._sum.netPay?.toString() || '0') / totalPayslips).toFixed(2)
              : '0',
          },
          monthlyData,
          recentPayslips: recentPayslipsData,
        },
        'Dashboard statistics fetched successfully'
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