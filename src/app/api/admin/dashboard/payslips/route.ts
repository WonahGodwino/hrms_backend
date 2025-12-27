// src/app/api/admin/Dashboard/payslips/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { CompanyInfo } from '@/app/lib/types/payslip'

interface AdminPayslipItem {
  id: string;
  month: string;
  year: number;
  grossPay: string | null;
  netPay: string | null;
  createdAt: Date;
  fileName: string;
  downloadUrl: string;
  staffRecord: {
    id: string;
    staffId: string;
    name: string;
    email: string;
    department: string;
    position: string;
  };
}

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
    const staffRecordId = searchParams.get('staffRecordId')
    const staffId = searchParams.get('staffId')
    const companyId = searchParams.get('companyId')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Build base where clause
    const whereClause: any = {}

    // Company filtering based on role
    if (user.role === 'HR') {
      // HR can only access their own company's data
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR user', 400),
          origin
        )
      }
      whereClause.companyId = user.companyId
    } else if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can filter by company if provided
      if (companyId) {
        whereClause.companyId = companyId
      }
    }

    // Filter by staff if provided
    if (staffRecordId) {
      whereClause.staffRecordId = staffRecordId
    } else if (staffId) {
      // Find staffRecordId by staffId
      const staffRecord = await prisma.staffRecord.findFirst({
        where: {
          staffId: staffId,
          companyId: whereClause.companyId || undefined,
        },
        select: { id: true }
      })
      if (staffRecord) {
        whereClause.staffRecordId = staffRecord.id
      }
    }

    // Filter by month/year if provided
    if (month) {
      whereClause.month = month
    }
    if (year) {
      whereClause.year = parseInt(year)
    }

    // Get total count for pagination
    const totalCount = await prisma.payslip.count({
      where: whereClause,
    })

    // Fetch payslips with staff information
    const payslips = await prisma.payslip.findMany({
      where: whereClause,
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
      include: {
        staffRecord: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
            companyId: true,
          }
        }
      },
    })

    // Transform the data
    const items: AdminPayslipItem[] = payslips.map((p: any) => ({
      id: p.id,
      month: p.month,
      year: p.year,
      grossPay: p.grossPay ? p.grossPay.toString() : null,
      netPay: p.netPay ? p.netPay.toString() : null,
      createdAt: p.createdAt,
      fileName: p.fileName,
      downloadUrl: `/api/payslips/${p.id}/download`,
      staffRecord: {
        id: p.staffRecord.id,
        staffId: p.staffRecord.staffId,
        name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`,
        email: p.staffRecord.email,
        department: p.staffRecord.department,
        position: p.staffRecord.position,
      }
    }))

    // Get unique companies for SUPER_ADMIN filter dropdown
    let companies: CompanyInfo[] = [];
    
    if (user.role === 'SUPER_ADMIN') {
      companies = await prisma.company.findMany({
        select: {
          id: true,
          companyName: true,
        },
        orderBy: { companyName: 'asc' }
      });
    }

    return withCors(
      ApiResponse.success(
        {
          payslips: items,
          companies,
          pagination: {
            total: totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
        'Payslips fetched successfully'
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