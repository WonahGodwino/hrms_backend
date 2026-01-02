// src/app/api/admin/company-assignments/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const role = searchParams.get('role')
    const companyId = searchParams.get('companyId')
    const format = searchParams.get('format') || 'excel'
    const reportType = searchParams.get('reportType') || 'assignments'

    // Build where clause for assignments
    const where: any = {}

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = new Date(startDate)
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    // Role filter
    if (role) {
      where.role = role
    }

    // Company filter
    if (companyId) {
      where.companyId = companyId
    }

    // Apply role-based access control
    let assignedCompanyIds: string[] = []
    if (currentUser.role !== 'SUPER_ADMIN') {
      // Get current user's company assignments using userId from auth
      const userAssignments = await prisma.userCompany.findMany({
        where: { 
          userId: currentUser.userId // Use userId from AuthUser
        },
        select: { companyId: true }
      })

      assignedCompanyIds = userAssignments.map(a => a.companyId)

      if (assignedCompanyIds.length === 0) {
        return withCors(
          ApiResponse.error('You are not assigned to any companies', 403),
          origin
        )
      }

      // If specific company is requested, verify access
      if (where.companyId) {
        if (!assignedCompanyIds.includes(where.companyId)) {
          return withCors(
            ApiResponse.error('You do not have access to this company', 403),
            origin
          )
        }
      } else {
        // Otherwise filter by user's companies
        where.companyId = { in: assignedCompanyIds }
      }
    }

    // Generate different reports based on type
    if (reportType === 'coverage' && currentUser.role === 'SUPER_ADMIN') {
      return await generateCoverageReport(currentUser, format, assignedCompanyIds)
    }

    return await generateAssignmentsReport(currentUser, where, format, assignedCompanyIds)

  } catch (error) {
    const message = formatError(error)
    console.error('Error generating company assignments report:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Generate the standard assignments report
async function generateAssignmentsReport(
  currentUser: any,
  where: any,
  format: string,
  assignedCompanyIds: string[]
) {
  // Fetch assignments with related data
  const assignments = await prisma.userCompany.findMany({
    where,
    include: {
      company: {
        select: {
          id: true,
          companyName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          country: true,
          status: true,
          archived: true,
          createdAt: true
        }
      },
      staffRecord: {
        select: {
          id: true,
          staffId: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
          role: true,
          isActive: true,
          isRegistered: true,
          phone: true,
          createdAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Prepare data for Excel
  const reportData = assignments.map((assignment, index) => {
    const user = assignment.staffRecord
    const company = assignment.company
    
    return {
      'S/N': index + 1,
      'User ID': user?.id || assignment.userId,
      'Staff ID': user?.staffId || 'N/A',
      'Full Name': user ? `${user.firstName} ${user.lastName}` : 'User Not Found',
      'Email': user?.email || 'N/A',
      'User Role': user?.role || 'N/A',
      'Department': user?.department || 'N/A',
      'Position': user?.position || 'N/A',
      'User Status': user?.isActive ? 'Active' : 'Inactive',
      'Registered': user?.isRegistered ? 'Yes' : 'No',
      'Phone': user?.phone || 'N/A',
      'Company ID': company?.id || assignment.companyId,
      'Company Name': company?.companyName || 'Company Not Found',
      'Company Email': company?.email || 'N/A',
      'Company Phone': company?.phone || 'N/A',
      'Company Status': company?.status || 'N/A',
      'Company Archived': company?.archived === 1 ? 'Yes' : 'No',
      'Company Address': company?.address || 'N/A',
      'Company City': company?.city || 'N/A',
      'Company State': company?.state || 'N/A',
      'Company Country': company?.country || 'N/A',
      'Assignment Role': assignment.role,
      'Assigned By': assignment.createdBy || 'System',
      'Assigned At': assignment.createdAt.toLocaleString(),
      'Last Updated': assignment.updatedAt?.toLocaleString() || 'N/A',
      'Updated By': assignment.updatedBy || 'N/A'
    }
  })

  // Create workbook
  const wb = XLSX.utils.book_new()
  
  // Add metadata sheet
  const metadata = [
    ['COMPANY ASSIGNMENTS REPORT'],
    ['Report Type:', 'Company User Assignments'],
    ['Generated By:', currentUser.email || currentUser.userId || 'Unknown'],
    ['User Role:', currentUser.role],
    ['Generated At:', new Date().toLocaleString()],
    ['Total Assignments:', assignments.length],
    ['Access Level:', currentUser.role === 'SUPER_ADMIN' ? 'All Companies' : 'Assigned Companies Only'],
    ['', ''],
    ['ROLE DISTRIBUTION:'],
  ]

  // Role distribution
  const roleCounts: Record<string, number> = {}
  assignments.forEach(assignment => {
    roleCounts[assignment.role] = (roleCounts[assignment.role] || 0) + 1
  })

  metadata.push(['Role', 'Count'])
  Object.entries(roleCounts).forEach(([role, count]) => {
    metadata.push([role, count])
  })

  metadata.push(['', ''])
  metadata.push(['COMPANY DISTRIBUTION:'])
  metadata.push(['Company', 'Assignments'])

  // Company distribution
  const companyCounts: Record<string, number> = {}
  assignments.forEach(assignment => {
    const companyName = assignment.company?.companyName || 'Unknown'
    companyCounts[companyName] = (companyCounts[companyName] || 0) + 1
  })

  Object.entries(companyCounts).forEach(([company, count]) => {
    metadata.push([company, count])
  })

  const metadataWs = XLSX.utils.aoa_to_sheet(metadata)
  XLSX.utils.book_append_sheet(wb, metadataWs, 'Report Info')

  // Create main data sheet
  const ws = XLSX.utils.json_to_sheet(reportData, { skipHeader: false })

  // Set column widths
  const colWidths = [
    { wch: 5 },   // S/N
    { wch: 30 },  // User ID
    { wch: 15 },  // Staff ID
    { wch: 25 },  // Full Name
    { wch: 25 },  // Email
    { wch: 15 },  // User Role
    { wch: 20 },  // Department
    { wch: 20 },  // Position
    { wch: 10 },  // User Status
    { wch: 10 },  // Registered
    { wch: 15 },  // Phone
    { wch: 30 },  // Company ID
    { wch: 30 },  // Company Name
    { wch: 25 },  // Company Email
    { wch: 15 },  // Company Phone
    { wch: 15 },  // Company Status
    { wch: 10 },  // Company Archived
    { wch: 30 },  // Company Address
    { wch: 15 },  // Company City
    { wch: 15 },  // Company State
    { wch: 15 },  // Company Country
    { wch: 15 },  // Assignment Role
    { wch: 25 },  // Assigned By
    { wch: 20 },  // Assigned At
    { wch: 20 },  // Last Updated
    { wch: 25 }   // Updated By
  ]
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, 'Assignments')

  return createFileResponse(wb, format, currentUser, 'assignments')
}

// Generate coverage report for SUPER_ADMIN only
async function generateCoverageReport(
  currentUser: any,
  format: string,
  assignedCompanyIds: string[]
) {
  // Get all non-archived companies
  const allCompanies = await prisma.company.findMany({
    where: { archived: 0 },
    select: {
      id: true,
      companyName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      country: true,
      status: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { companyName: 'asc' }
  })

  // Get all assignments for these companies
  const allAssignments = await prisma.userCompany.findMany({
    where: {
      companyId: { in: allCompanies.map(c => c.id) },
      role: { in: ['ADMIN', 'HR', 'MANAGER'] }
    },
    include: {
      staffRecord: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true
        }
      }
    }
  })

  // Group assignments by company
  const assignmentsByCompany: Record<string, any[]> = {}
  allAssignments.forEach(assignment => {
    if (!assignmentsByCompany[assignment.companyId]) {
      assignmentsByCompany[assignment.companyId] = []
    }
    assignmentsByCompany[assignment.companyId].push(assignment)
  })

  // Prepare coverage report data
  const coverageData = allCompanies.map((company, index) => {
    const companyAssignments = assignmentsByCompany[company.id] || []
    const admins = companyAssignments.filter(a => a.role === 'ADMIN')
    const hrs = companyAssignments.filter(a => a.role === 'HR')
    const managers = companyAssignments.filter(a => a.role === 'MANAGER')
    
    const hasAdmin = admins.length > 0
    const hasHR = hrs.length > 0
    const hasManager = managers.length > 0
    const hasAnyManager = hasAdmin || hasHR || hasManager
    
    return {
      'S/N': index + 1,
      'Company ID': company.id,
      'Company Name': company.companyName,
      'Company Email': company.email || 'N/A',
      'Company Phone': company.phone || 'N/A',
      'Company Status': company.status || 'N/A',
      'Company Address': company.address || 'N/A',
      'Company City': company.city || 'N/A',
      'Company State': company.state || 'N/A',
      'Company Country': company.country || 'N/A',
      'Has Admin?': hasAdmin ? 'YES' : 'NO',
      'Admin Count': admins.length,
      'Admins': admins.map(a => `${a.staffRecord?.firstName} ${a.staffRecord?.lastName}`).join(', ') || 'None',
      'Admin Emails': admins.map(a => a.staffRecord?.email).join(', ') || 'None',
      'Has HR?': hasHR ? 'YES' : 'NO',
      'HR Count': hrs.length,
      'HRs': hrs.map(a => `${a.staffRecord?.firstName} ${a.staffRecord?.lastName}`).join(', ') || 'None',
      'HR Emails': hrs.map(a => a.staffRecord?.email).join(', ') || 'None',
      'Has Manager?': hasManager ? 'YES' : 'NO',
      'Manager Count': managers.length,
      'Managers': managers.map(a => `${a.staffRecord?.firstName} ${a.staffRecord?.lastName}`).join(', ') || 'None',
      'Manager Emails': managers.map(a => a.staffRecord?.email).join(', ') || 'None',
      'Has ANY Manager?': hasAnyManager ? 'YES' : 'NO',
      'Total Managers': companyAssignments.length,
      'All Managers': companyAssignments.map(a => 
        `${a.staffRecord?.firstName} ${a.staffRecord?.lastName} (${a.role})`
      ).join(', ') || 'None',
      'All Emails': companyAssignments.map(a => a.staffRecord?.email).join(', ') || 'None',
      'Coverage Status': hasAnyManager ? 'COVERED' : 'UNCOVERED',
      'Risk Level': hasAnyManager ? 'LOW' : 'HIGH',
      'Created At': company.createdAt.toLocaleDateString(),
      'Last Updated': company.updatedAt?.toLocaleDateString() || 'N/A'
    }
  })

  // Create workbook
  const wb = XLSX.utils.book_new()
  
  // Add metadata sheet with summary
  const summary = [
    ['COMPANY MANAGER COVERAGE REPORT'],
    ['Report Type:', 'Company Management Coverage Analysis'],
    ['Generated By:', currentUser.email || currentUser.userId || 'Unknown'],
    ['User Role:', currentUser.role],
    ['Generated At:', new Date().toLocaleString()],
    ['', ''],
    ['EXECUTIVE SUMMARY:'],
  ]

  const totalCompanies = allCompanies.length
  const coveredCompanies = coverageData.filter(c => c['Has ANY Manager?'] === 'YES').length
  const uncoveredCompanies = totalCompanies - coveredCompanies
  const coveragePercentage = totalCompanies > 0 ? ((coveredCompanies / totalCompanies) * 100).toFixed(1) : '0.0'

  summary.push(['Total Companies:', totalCompanies])
  summary.push(['Companies with Managers:', coveredCompanies])
  summary.push(['Companies without Managers:', uncoveredCompanies])
  summary.push(['Coverage Rate:', `${coveragePercentage}%`])
  summary.push(['', ''])

  // Breakdown by manager type
  const companiesWithAdmin = coverageData.filter(c => c['Has Admin?'] === 'YES').length
  const companiesWithHR = coverageData.filter(c => c['Has HR?'] === 'YES').length
  const companiesWithManager = coverageData.filter(c => c['Has Manager?'] === 'YES').length

  summary.push(['MANAGER TYPE BREAKDOWN:'])
  summary.push(['Companies with Admin:', companiesWithAdmin])
  summary.push(['Companies with HR:', companiesWithHR])
  summary.push(['Companies with Manager:', companiesWithManager])
  summary.push(['', ''])

  // List of uncovered companies
  const uncoveredCompaniesList = coverageData.filter(c => c['Coverage Status'] === 'UNCOVERED')
  if (uncoveredCompaniesList.length > 0) {
    summary.push(['HIGH RISK COMPANIES (NO MANAGERS):'])
    summary.push(['S/N', 'Company Name', 'Company Email', 'Risk Level'])
    uncoveredCompaniesList.forEach((company, idx) => {
      summary.push([idx + 1, company['Company Name'], company['Company Email'], 'HIGH'])
    })
  }

  const summaryWs = XLSX.utils.aoa_to_sheet(summary)
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Executive Summary')

  // Create coverage data sheet
  const ws = XLSX.utils.json_to_sheet(coverageData, { skipHeader: false })

  // Set column widths for coverage report
  const colWidths = [
    { wch: 5 },    // S/N
    { wch: 30 },   // Company ID
    { wch: 30 },   // Company Name
    { wch: 25 },   // Company Email
    { wch: 15 },   // Company Phone
    { wch: 15 },   // Company Status
    { wch: 30 },   // Company Address
    { wch: 15 },   // Company City
    { wch: 15 },   // Company State
    { wch: 15 },   // Company Country
    { wch: 10 },   // Has Admin?
    { wch: 10 },   // Admin Count
    { wch: 25 },   // Admins
    { wch: 25 },   // Admin Emails
    { wch: 10 },   // Has HR?
    { wch: 10 },   // HR Count
    { wch: 25 },   // HRs
    { wch: 25 },   // HR Emails
    { wch: 12 },   // Has Manager?
    { wch: 12 },   // Manager Count
    { wch: 25 },   // Managers
    { wch: 25 },   // Manager Emails
    { wch: 15 },   // Has ANY Manager?
    { wch: 15 },   // Total Managers
    { wch: 40 },   // All Managers
    { wch: 40 },   // All Emails
    { wch: 15 },   // Coverage Status
    { wch: 10 },   // Risk Level
    { wch: 12 },   // Created At
    { wch: 12 },   // Last Updated
  ]
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, 'Company Coverage')

  // Add uncovered companies sheet
  if (uncoveredCompaniesList.length > 0) {
    const uncoveredData = uncoveredCompaniesList.map((company, idx) => ({
      'S/N': idx + 1,
      'Company ID': company['Company ID'],
      'Company Name': company['Company Name'],
      'Company Email': company['Company Email'],
      'Company Phone': company['Company Phone'],
      'Company Address': company['Company Address'],
      'Company City': company['Company City'],
      'Company State': company['Company State'],
      'Company Country': company['Company Country'],
      'Risk Level': 'HIGH',
      'Action Required': 'ASSIGN ADMIN/HR/MANAGER',
      'Priority': 'URGENT',
      'Created At': company['Created At'],
      'Days Since Creation': Math.floor((new Date().getTime() - new Date(company['Created At']).getTime()) / (1000 * 60 * 60 * 24))
    }))

    const uncoveredWs = XLSX.utils.json_to_sheet(uncoveredData, { skipHeader: false })
    
    const uncoveredWidths = [
      { wch: 5 },    // S/N
      { wch: 30 },   // Company ID
      { wch: 30 },   // Company Name
      { wch: 25 },   // Company Email
      { wch: 15 },   // Company Phone
      { wch: 30 },   // Company Address
      { wch: 15 },   // Company City
      { wch: 15 },   // Company State
      { wch: 15 },   // Company Country
      { wch: 10 },   // Risk Level
      { wch: 20 },   // Action Required
      { wch: 10 },   // Priority
      { wch: 12 },   // Created At
      { wch: 15 },   // Days Since Creation
    ]
    uncoveredWs['!cols'] = uncoveredWidths

    XLSX.utils.book_append_sheet(wb, uncoveredWs, 'High Risk Companies')
  }

  return createFileResponse(wb, format, currentUser, 'coverage')
}

// Helper function to create file response
function createFileResponse(
  wb: XLSX.WorkBook,
  format: string,
  currentUser: any,
  reportType: string
): NextResponse {
  // Generate buffer based on format
  let buffer: Buffer
  let contentType: string
  let filename: string

  const timestamp = new Date().toISOString().split('T')[0]
  const userPrefix = currentUser.role === 'SUPER_ADMIN' ? 'ALL-' : 'MY-'
  const typeSuffix = reportType === 'coverage' ? '-coverage' : '-assignments'

  if (format === 'csv') {
    const ws = wb.Sheets[wb.SheetNames[1]] // Get first data sheet
    const csv = XLSX.utils.sheet_to_csv(ws)
    buffer = Buffer.from(csv, 'utf8')
    contentType = 'text/csv'
    filename = `company${typeSuffix}-${userPrefix}${timestamp}.csv`
  } else {
    buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    filename = `company${typeSuffix}-${userPrefix}${timestamp}.xlsx`
  }

  // Create response with file
  const response = new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })

  return response
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}