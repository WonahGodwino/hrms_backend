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
    let ownStaffRecordId: string | null = null
    let ownCompanyId: string | null = null
    
    if (user.role === 'HR' || user.role === 'ADMIN') {
      const userAssignments = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          role: user.role === 'HR' ? 'HR' : { in: ['ADMIN', 'HR'] }
        },
        select: { companyId: true }
      })
      
      userAssignedCompanyIds = userAssignments.map(a => a.companyId)

      // Keep an own-record fallback so HR/ADMIN can still see only their own payslip
      // even when they are not assigned to any company via user_companies.
      const ownStaffRecord = await prisma.staffRecord.findUnique({
        where: { id: user.userId },
        select: { id: true, companyId: true }
      })

      ownStaffRecordId = ownStaffRecord?.id ?? null
      ownCompanyId = ownStaffRecord?.companyId ?? null
    }

    // Build base where clause
    const whereClause: any = {}

    // Add filter for createdBy when toggle is ON
    if (showOnlyMine) {
      whereClause.createdBy = user.userId
    }

    // Company filtering based on role
    if (user.role === 'HR' || user.role === 'ADMIN') {
      // HR/ADMIN can view:
      // 1) payslips for companies assigned in user_companies
      // 2) their own payslip only (fallback when unassigned)
      const visibilityOr: any[] = []

      if (userAssignedCompanyIds.length > 0) {
        visibilityOr.push({ companyId: { in: userAssignedCompanyIds } })
      }
      if (ownStaffRecordId) {
        visibilityOr.push({ staffRecordId: ownStaffRecordId })
      }

      if (visibilityOr.length === 0) {
        return withCors(
          ApiResponse.error('No payslip access scope configured for this user', 403),
          origin
        )
      }

      whereClause.AND = [
        ...(whereClause.AND || []),
        { OR: visibilityOr }
      ]

      // If a specific companyId is requested, allow it only if assigned
      // or it's the user's own company (then restrict to own payslip).
      if (requestedCompanyId) {
        const hasAssignedAccess = userAssignedCompanyIds.includes(requestedCompanyId)
        const isOwnCompany = ownCompanyId === requestedCompanyId

        if (!hasAssignedAccess && !isOwnCompany) {
          return withCors(
            ApiResponse.error(`You don't have access to company ${requestedCompanyId}`, 403),
            origin
          )
        }

        whereClause.AND.push({ companyId: requestedCompanyId })

        if (!hasAssignedAccess && isOwnCompany && ownStaffRecordId) {
          whereClause.AND.push({ staffRecordId: ownStaffRecordId })
        }
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
          select: { id: true, companyId: true }
        })
        
        if (!staffRecord) {
          return withCors(
            ApiResponse.error('Staff record not found', 404),
            origin
          )
        }

        const canAccessRequestedStaff =
          userAssignedCompanyIds.includes(staffRecord.companyId) ||
          (ownStaffRecordId !== null && staffRecord.id === ownStaffRecordId)

        if (!canAccessRequestedStaff) {
          return withCors(
            ApiResponse.error('You do not have access to this staff member', 403),
            origin
          )
        }
      }
      
      whereClause.staffRecordId = staffRecordId
    } else if (staffId) {
      // Find staffRecordId by staffId and enforce access scope
      let staffRecord: { id: string; companyId: string } | null = null

      if (user.role === 'HR' || user.role === 'ADMIN') {
        const matchingStaffRecords = await prisma.staffRecord.findMany({
          where: { staffId },
          select: { id: true, companyId: true }
        })

        staffRecord =
          matchingStaffRecords.find(s => ownStaffRecordId !== null && s.id === ownStaffRecordId) ||
          matchingStaffRecords.find(s => userAssignedCompanyIds.includes(s.companyId)) ||
          null
      } else {
        staffRecord = await prisma.staffRecord.findFirst({
          where: { staffId },
          select: { id: true, companyId: true }
        })
      }
      
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
      // HR/ADMIN company filter list = assigned companies + own company fallback
      const visibleCompanyIds = Array.from(
        new Set([
          ...userAssignedCompanyIds,
          ...(ownCompanyId ? [ownCompanyId] : [])
        ])
      )

      if (visibleCompanyIds.length > 0) {
        companies = await prisma.company.findMany({
          where: {
            id: { in: visibleCompanyIds },
            archived: 0
          },
          select: {
            id: true,
            companyName: true,
          },
          orderBy: { companyName: 'asc' }
        })
      }
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