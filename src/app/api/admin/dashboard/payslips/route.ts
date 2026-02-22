// src/app/api/admin/Dashboard/payslips/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

interface AdminPayslipItem {
  id: string;
  month: string;
  year: number;
  grossPay: string | null;
  netPay: string | null;
  createdAt: Date;
  fileName: string;
  downloadUrl: string;
  companyId: string;
  staffRecord: {
    id: string;
    staffId: string;
    name: string;
    email: string;
    department: string | null;
    position: string | null;
    companyId: string;
  };
}

interface CompanyInfo {
  id: string;
  companyName: string;
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
    const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN'])

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const staffRecordId = searchParams.get('staffRecordId')
    const staffId = searchParams.get('staffId')
    const requestedCompanyId = searchParams.get('companyId')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const showOnlyMine = searchParams.get('showOnlyMine') === 'true'
    
    const skip = (page - 1) * limit

    // Get user's assigned companies from UserCompany table
    let userAssignedCompanyIds: string[] = []
    
    if (user.role === 'HR' || user.role === 'ADMIN') {
      const userAssignments = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          role: user.role === 'HR' ? 'HR' : { in: ['ADMIN', 'HR'] }
        },
        select: { companyId: true }
      })
      
      userAssignedCompanyIds = userAssignments.map(a => a.companyId)
      
      if (userAssignedCompanyIds.length === 0) {
        return withCors(
          ApiResponse.error(`${user.role} user is not assigned to any company yet`, 403),
          origin
        )
      }
    }

    // Build base where clause
    const whereClause: any = {}

    // Add filter for createdBy when toggle is ON
    if (showOnlyMine) {
      whereClause.createdBy = user.userId
    }

    // Company filtering based on role
    if (user.role === 'HR' || user.role === 'ADMIN') {
      // HR/ADMIN can only access companies they're assigned to
      whereClause.companyId = { in: userAssignedCompanyIds }
      
      // If a specific companyId is requested, validate that user has access to it
      if (requestedCompanyId) {
        if (!userAssignedCompanyIds.includes(requestedCompanyId)) {
          return withCors(
            ApiResponse.error(`You don't have access to company ${requestedCompanyId}`, 403),
            origin
          )
        }
        // If companyId filter is provided and user has access, use it
        whereClause.companyId = requestedCompanyId
      }
    } else if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can filter by company if provided
      if (requestedCompanyId) {
        whereClause.companyId = requestedCompanyId
      }
    }

    // Filter by staff if provided
    if (staffRecordId) {
      // Validate that the staff belongs to a company the user has access to
      if (user.role === 'HR' || user.role === 'ADMIN') {
        const staffRecord = await prisma.staffRecord.findUnique({
          where: { id: staffRecordId },
          select: { companyId: true }
        })
        
        if (!staffRecord) {
          return withCors(
            ApiResponse.error('Staff record not found', 404),
            origin
          )
        }
        
        if (!userAssignedCompanyIds.includes(staffRecord.companyId)) {
          return withCors(
            ApiResponse.error('You do not have access to this staff member', 403),
            origin
          )
        }
      }
      
      whereClause.staffRecordId = staffRecordId
    } else if (staffId) {
      // Find staffRecordId by staffId
      const staffWhere: any = { staffId: staffId }
      
      // For HR/ADMIN, also filter by accessible companies
      if (user.role === 'HR' || user.role === 'ADMIN') {
        staffWhere.companyId = { in: userAssignedCompanyIds }
      }
      
      const staffRecord = await prisma.staffRecord.findFirst({
        where: staffWhere,
        select: { id: true, companyId: true }
      })
      
      if (!staffRecord) {
        return withCors(
          ApiResponse.error('Staff record not found, you may Contact Support for more help', 404),
          origin
        )
      }
      
      whereClause.staffRecordId = staffRecord.id
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

    // Transform the data with companyId included
    const items: AdminPayslipItem[] = payslips.map((p) => ({
      id: p.id,
      month: p.month,
      year: p.year,
      grossPay: p.grossPay ? p.grossPay.toString() : null,
      netPay: p.netPay ? p.netPay.toString() : null,
      createdAt: p.createdAt,
      fileName: p.fileName,
      downloadUrl: `/api/payslips/${p.id}/download`,
      companyId: p.companyId,
      staffRecord: {
        id: p.staffRecord.id,
        staffId: p.staffRecord.staffId,
        name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`,
        email: p.staffRecord.email,
        department: p.staffRecord.department,
        position: p.staffRecord.position,
        companyId: p.staffRecord.companyId,
      }
    }))

    // Get unique companies for filter dropdown
    let companies: CompanyInfo[] = [];
    
    if (user.role === 'SUPER_ADMIN') {
      companies = await prisma.company.findMany({
        where: {
          archived: 0
        },
        select: {
          id: true,
          companyName: true,
        },
        orderBy: { companyName: 'asc' }
      });
    } else if (user.role === 'HR' || user.role === 'ADMIN') {
      // HR/ADMIN can only see companies they're assigned to
      const assignedCompanies = await prisma.company.findMany({
        where: {
          id: { in: userAssignedCompanyIds },
          archived: 0
        },
        select: {
          id: true,
          companyName: true,
        },
        orderBy: { companyName: 'asc' }
      });
      companies = assignedCompanies;
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
          filter: {
            showOnlyMine,
          }
        },
        'Payslips fetched successfully'
      ),
      origin
    )
  } catch (error) {
    console.error('[ADMIN_PAYSLIPS] Error:', error)
    return withCors(
      handleApiError(error),
      origin
    )
  }
}