// src/app/api/admin/staff/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { CompanyInfo } from '@/app/lib/types/payslip'

interface StaffItem {
  id: string;
  staffId: string;
  name: string;
  email: string;
  department: string;
  position: string;
  isActive: boolean;
  companyName: string;
  payslipCount: number;
  actions: {
    viewPayslips: string;
    downloadAllPayslips: string;
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
    const search = searchParams.get('search') || ''
    const companyId = searchParams.get('companyId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // Build where clause
    const whereClause: any = {
      isActive: true,
    }

    // Company filtering
    if (user.role === 'HR') {
      whereClause.companyId = user.companyId
    } else if (user.role === 'SUPER_ADMIN' && companyId) {
      whereClause.companyId = companyId
    }

    // Search filter
    if (search) {
      whereClause.OR = [
        { staffId: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get total count
    const totalCount = await prisma.staffRecord.count({
      where: whereClause,
    })

    // Fetch staff records
    const staffRecords = await prisma.staffRecord.findMany({
      where: whereClause,
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
      skip,
      take: limit,
      select: {
        id: true,
        staffId: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        position: true,
        isActive: true,
        companyId: true,
        company: {
          select: {
            name: true,
          }
        },
        _count: {
          select: {
            payslips: true,
          }
        }
      },
    })

    // Transform data
    const items: StaffItem[] = staffRecords.map((staff: any) => ({
      id: staff.id,
      staffId: staff.staffId,
      name: `${staff.firstName} ${staff.lastName}`,
      email: staff.email,
      department: staff.department,
      position: staff.position,
      isActive: staff.isActive,
      companyName: staff.company?.name || 'N/A',
      payslipCount: staff._count.payslips,
      actions: {
        viewPayslips: `/api/admin/payslips?staffRecordId=${staff.id}`,
        downloadAllPayslips: `/api/admin/payslips/export?staffRecordId=${staff.id}`,
      }
    }))

    // Get companies for SUPER_ADMIN filter
    let companies: CompanyInfo[] = [];
    if (user.role === 'SUPER_ADMIN') {
      companies = await prisma.company.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' }
      });
    }

    return withCors(
      ApiResponse.success(
        {
          staff: items,
          companies,
          pagination: {
            total: totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
        'Staff records fetched successfully'
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