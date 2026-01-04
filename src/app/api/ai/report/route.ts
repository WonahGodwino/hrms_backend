// src/app/api/ai/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'
import { openaiUsageTracker } from '@/app/lib/openaiUsage'

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return withCors(new NextResponse(null, { status: 200 }), origin)
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
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])
    
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv'
    const companyId = searchParams.get('companyId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const reportType = searchParams.get('type') || 'detailed'

    // Only support CSV format
    if (format !== 'csv') {
      return withCors(
        ApiResponse.error('Only CSV format is currently supported. Please use format=csv', 400),
        origin
      )
    }

    // Determine target companies based on user role and input
    let targetCompanyIds: string[] = []
    let isAllCompanies = false
    let selectedCompanyName = ''

    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can view all companies or specific company
      if (companyId === 'all') {
        // Get all companies
        isAllCompanies = true
        const allCompanies = await prisma.company.findMany({
          where: { archived: 0 },
          select: { id: true }
        })
        targetCompanyIds = allCompanies.map(c => c.id)
      } else if (companyId) {
        // Specific company selected
        targetCompanyIds = [companyId]
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { companyName: true }
        })
        selectedCompanyName = company?.companyName || companyId
      } else {
        // No company specified - return error
        return withCors(
          ApiResponse.error('SUPER_ADMIN must specify companyId parameter or use "all" for all companies', 400),
          origin
        )
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN can view assigned companies or specific assigned company
      const userCompanies = await prisma.userCompany.findMany({
        where: { 
          userId: user.userId,
          role: { in: ['ADMIN', 'ALL'] }
        },
        include: {
          company: {
            select: {
              id: true,
              companyName: true,
              archived: true
            }
          }
        }
      })

      // Filter out archived companies
      const accessibleCompanies = userCompanies
        .filter(uc => uc.company && uc.company.archived === 0)
        .map(uc => uc.company!)

      if (accessibleCompanies.length === 0) {
        return withCors(
          ApiResponse.error('No accessible companies found for ADMIN user', 403),
          origin
        )
      }

      if (companyId) {
        // Check if ADMIN has access to the specified company
        const hasAccess = accessibleCompanies.some(c => c.id === companyId)
        if (!hasAccess) {
          return withCors(
            ApiResponse.error('ADMIN does not have access to the specified company', 403),
            origin
          )
        }
        targetCompanyIds = [companyId]
        selectedCompanyName = accessibleCompanies.find(c => c.id === companyId)?.companyName || companyId
      } else {
        // No specific company - use all accessible companies
        targetCompanyIds = accessibleCompanies.map(c => c.id)
        if (accessibleCompanies.length === 1) {
          selectedCompanyName = accessibleCompanies[0].companyName
        }
      }
    } else {
      // HR users - only their own company (from token)
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR user', 400),
          origin
        )
      }

      // HR cannot specify companyId - they only have access to their own
      if (companyId && companyId !== user.companyId) {
        return withCors(
          ApiResponse.error('HR users can only generate reports for their own company', 403),
          origin
        )
      }

      targetCompanyIds = [user.companyId]
      
      // Get company name for HR
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { companyName: true }
      })
      selectedCompanyName = company?.companyName || user.companyId
    }

    // Get company/companies info for the report
    let companies: any[] = []
    
    if (isAllCompanies) {
      // SUPER_ADMIN viewing all companies
      companies = await prisma.company.findMany({
        where: { 
          id: { in: targetCompanyIds },
          archived: 0 
        },
        select: { 
          id: true, 
          companyName: true,
          aiSettings: {
            select: {
              monthlyBudget: true,
              costAlertThreshold: true
            }
          }
        },
        orderBy: { companyName: 'asc' }
      })
    } else {
      // Single or multiple companies (for ADMIN with multiple assignments)
      companies = await prisma.company.findMany({
        where: { 
          id: { in: targetCompanyIds },
          archived: 0 
        },
        select: { 
          id: true, 
          companyName: true,
          aiSettings: {
            select: {
              monthlyBudget: true,
              costAlertThreshold: true
            }
          }
        },
        orderBy: { companyName: 'asc' }
      })
    }

    if (companies.length === 0) {
      return withCors(
        ApiResponse.error('No companies found for the specified criteria', 404),
        origin
      )
    }

    // Get AI usage data
    const aiApplications = await getAIApplications(
      targetCompanyIds, 
      user.role === 'SUPER_ADMIN' && isAllCompanies,
      isAllCompanies
    )
    
    // Process data based on report type
    let reportData: any
    let csvContent: string
    let filename: string
    
    const timestamp = new Date().toISOString().split('T')[0]
    const companyPrefix = isAllCompanies 
      ? 'all-companies' 
      : companies.length === 1
        ? companies[0].companyName?.replace(/\s+/g, '-').toLowerCase() || 'company'
        : 'multiple-companies'

    switch (reportType) {
      case 'summary':
        reportData = await generateSummaryReport(
          companies, 
          aiApplications, 
          user.role, 
          startDate, 
          endDate,
          isAllCompanies
        )
        csvContent = generateSummaryCSV(reportData)
        filename = `ai-cost-summary-${companyPrefix}-${timestamp}.csv`
        break
      case 'audit':
        reportData = await generateAuditReport(
          companies, 
          user.role, 
          startDate, 
          endDate,
          targetCompanyIds
        )
        csvContent = generateAuditCSV(reportData)
        filename = `ai-cost-audit-${companyPrefix}-${timestamp}.csv`
        break
      case 'detailed':
      default:
        reportData = await generateDetailedReport(
          companies, 
          aiApplications, 
          user.role, 
          startDate, 
          endDate,
          isAllCompanies
        )
        csvContent = generateDetailedCSV(reportData)
        filename = `ai-cost-detailed-${companyPrefix}-${timestamp}.csv`
        break
    }

    // Convert to Uint8Array for NextResponse
    const encoder = new TextEncoder()
    const fileData = encoder.encode(csvContent)
    
    // Return file as response with CORS
    const response = new NextResponse(fileData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
    
    return withCors(response, origin)

  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error generating AI cost report:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Helper function to get AI applications with proper filtering
async function getAIApplications(
  companyIds: string[], 
  isSuperAdmin: boolean,
  isAllCompanies: boolean = false
) {
  const whereClause: any = {
    OR: [
      {
        metadata: {
          path: ['reviewMethod'],
          string_contains: 'ai'
        }
      },
      {
        metadata: {
          path: ['reviewedByAI'],
          equals: true
        }
      },
      {
        metadata: {
          path: ['aiReview'],
          equals: true
        }
      },
      {
        metadata: {
          path: ['aiDetails', 'service'],
          not: null
        }
      },
      {
        metadata: {
          path: ['aiService'],
          not: null
        }
      }
    ]
  }

  if (!isAllCompanies) {
    whereClause.job = {
      companyId: { in: companyIds }
    }
  }

  const applications = await prisma.jobApplication.findMany({
    where: whereClause,
    select: {
      id: true,
      score: true,
      metadata: true,
      reviewedAt: true,
      job: {
        select: {
          id: true,
          title: true,
          department: true,
          companyId: true,
          company: {
            select: {
              id: true,
              companyName: true
            }
          }
        }
      },
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          email: true
        }
      }
    },
    orderBy: {
      reviewedAt: 'desc'
    },
    take: isSuperAdmin ? 10000 : 5000
  })

  return applications
}

// Generate detailed report
async function generateDetailedReport(
  companies: any[], 
  aiApplications: any[], 
  userRole: string,
  startDate?: string | null,
  endDate?: string | null,
  isAllCompanies: boolean = false
) {
  // Filter by date range if provided
  let filteredApplications = aiApplications
  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    
    filteredApplications = aiApplications.filter(app => {
      const reviewDate = app.reviewedAt ? new Date(app.reviewedAt) : null
      return reviewDate && reviewDate >= start && reviewDate <= end
    })
  }

  return {
    data: filteredApplications.map(app => {
      const metadata = app.metadata as any
      const aiDetails = metadata?.aiDetails
      
      return {
        'Application ID': app.id,
        'Review Date': app.reviewedAt ? new Date(app.reviewedAt).toLocaleDateString() : 'N/A',
        'Review Time': app.reviewedAt ? new Date(app.reviewedAt).toLocaleTimeString() : 'N/A',
        'Candidate Name': app.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}` : 'Unknown',
        'Candidate Email': app.candidate?.email || 'N/A',
        'Job Title': app.job?.title || 'Unknown',
        'Department': app.job?.department || 'Unknown',
        'Company': app.job?.company?.companyName || 'Unknown',
        'Company ID': app.job?.companyId || 'Unknown',
        'AI Service': aiDetails?.service || metadata?.aiService || 'unknown',
        'AI Model': aiDetails?.model || metadata?.aiModel || 'unknown',
        'Score (%)': app.score || 0,
        'Tokens Used': aiDetails?.tokensUsed || metadata?.tokensUsed || 0,
        'Cost ($)': aiDetails?.estimatedCost || metadata?.estimatedCost || 0,
        'Time to Productivity': aiDetails?.timeToProductivity || metadata?.timeToProductivity || 'N/A',
        'Cultural Fit': aiDetails?.culturalFit || metadata?.culturalFit || 'N/A',
        'Growth Potential': aiDetails?.growthPotential || metadata?.growthPotential || 'N/A',
        'Strengths': (aiDetails?.strengths || metadata?.strengths || []).join('; '),
        'Weaknesses': (aiDetails?.weaknesses || metadata?.weaknesses || []).join('; '),
        'Review Method': metadata?.reviewMethod || 'N/A'
      }
    }),
    summary: {
      totalApplications: filteredApplications.length,
      totalCost: filteredApplications.reduce((sum, app) => {
        const metadata = app.metadata as any
        const aiDetails = metadata?.aiDetails
        return sum + (aiDetails?.estimatedCost || metadata?.estimatedCost || 0)
      }, 0),
      totalTokens: filteredApplications.reduce((sum, app) => {
        const metadata = app.metadata as any
        const aiDetails = metadata?.aiDetails
        return sum + (aiDetails?.tokensUsed || metadata?.tokensUsed || 0)
      }, 0),
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      },
      generatedAt: new Date().toISOString(),
      generatedBy: userRole,
      companiesCount: companies.length,
      isAllCompanies: isAllCompanies
    }
  }
}

// Generate summary report
async function generateSummaryReport(
  companies: any[], 
  aiApplications: any[], 
  userRole: string,
  startDate?: string | null,
  endDate?: string | null,
  isAllCompanies: boolean = false
) {
  // Filter by date range if provided
  let filteredApplications = aiApplications
  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    
    filteredApplications = aiApplications.filter(app => {
      const reviewDate = app.reviewedAt ? new Date(app.reviewedAt) : null
      return reviewDate && reviewDate >= start && reviewDate <= end
    })
  }

  let summaryData: any[]
  
  if (isAllCompanies || companies.length > 1) {
    // Multiple companies view (SUPER_ADMIN: all or ADMIN: multiple assigned)
    summaryData = companies.map(company => {
      const companyApps = filteredApplications.filter(app => app.job?.companyId === company.id)
      const totalCost = companyApps.reduce((sum, app) => {
        const metadata = app.metadata as any
        const aiDetails = metadata?.aiDetails
        return sum + (aiDetails?.estimatedCost || metadata?.estimatedCost || 0)
      }, 0)
      
      const totalApplications = companyApps.length
      const avgCostPerReview = totalApplications > 0 ? totalCost / totalApplications : 0
      const totalTokens = companyApps.reduce((sum, app) => {
        const metadata = app.metadata as any
        const aiDetails = metadata?.aiDetails
        return sum + (aiDetails?.tokensUsed || metadata?.tokensUsed || 0)
      }, 0)
      
      return {
        'Company Name': company.companyName,
        'Company ID': company.id,
        'Monthly Budget ($)': company.aiSettings?.monthlyBudget || 100,
        'Total Applications': totalApplications,
        'Total Cost ($)': parseFloat(totalCost.toFixed(4)),
        'Average Cost/Review ($)': parseFloat(avgCostPerReview.toFixed(4)),
        'Total Tokens Used': totalTokens,
        'Budget Used (%)': company.aiSettings?.monthlyBudget 
          ? parseFloat(((totalCost / company.aiSettings.monthlyBudget) * 100).toFixed(1))
          : 0,
        'Status': company.aiSettings?.monthlyBudget && totalCost > company.aiSettings.monthlyBudget 
          ? 'Over Budget' 
          : company.aiSettings?.monthlyBudget && (totalCost / company.aiSettings.monthlyBudget) > 0.9
            ? 'Near Limit'
            : 'Normal'
      }
    })
  } else {
    // Single company view - group by department and service
    const company = companies[0]
    const companyApps = filteredApplications.filter(app => app.job?.companyId === company.id)
    
    // Group by department
    const departmentData = companyApps.reduce((acc: any, app) => {
      const dept = app.job?.department || 'Unknown'
      const metadata = app.metadata as any
      const aiDetails = metadata?.aiDetails
      const cost = aiDetails?.estimatedCost || metadata?.estimatedCost || 0
      
      if (!acc[dept]) {
        acc[dept] = {
          applications: 0,
          totalCost: 0,
          totalTokens: 0
        }
      }
      
      acc[dept].applications++
      acc[dept].totalCost += cost
      acc[dept].totalTokens += (aiDetails?.tokensUsed || metadata?.tokensUsed || 0)
      
      return acc
    }, {})
    
    // Group by service
    const serviceData = companyApps.reduce((acc: any, app) => {
      const metadata = app.metadata as any
      const aiDetails = metadata?.aiDetails
      const service = aiDetails?.service || metadata?.aiService || 'unknown'
      const cost = aiDetails?.estimatedCost || metadata?.estimatedCost || 0
      
      if (!acc[service]) {
        acc[service] = {
          applications: 0,
          totalCost: 0,
          totalTokens: 0
        }
      }
      
      acc[service].applications++
      acc[service].totalCost += cost
      acc[service].totalTokens += (aiDetails?.tokensUsed || metadata?.tokensUsed || 0)
      
      return acc
    }, {})
    
    // Format department data
    const departmentRows = Object.entries(departmentData).map(([dept, data]: [string, any]) => ({
      'Group By': 'Department',
      'Category': dept,
      'Applications': data.applications,
      'Total Cost ($)': parseFloat(data.totalCost.toFixed(4)),
      'Average Cost/App ($)': parseFloat((data.totalCost / data.applications).toFixed(4)),
      'Total Tokens': data.totalTokens
    }))
    
    // Format service data
    const serviceRows = Object.entries(serviceData).map(([service, data]: [string, any]) => ({
      'Group By': 'AI Service',
      'Category': service,
      'Applications': data.applications,
      'Total Cost ($)': parseFloat(data.totalCost.toFixed(4)),
      'Average Cost/App ($)': parseFloat((data.totalCost / data.applications).toFixed(4)),
      'Total Tokens': data.totalTokens
    }))
    
    summaryData = [...departmentRows, ...serviceRows]
  }

  return {
    data: summaryData,
    summary: {
      totalApplications: filteredApplications.length,
      totalCost: filteredApplications.reduce((sum, app) => {
        const metadata = app.metadata as any
        const aiDetails = metadata?.aiDetails
        return sum + (aiDetails?.estimatedCost || metadata?.estimatedCost || 0)
      }, 0),
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      },
      generatedAt: new Date().toISOString(),
      generatedBy: userRole,
      company: companies.length === 1 ? companies[0]?.companyName : `${companies.length} Companies`
    }
  }
}

// Generate audit report
async function generateAuditReport(
  companies: any[], 
  userRole: string,
  startDate?: string | null,
  endDate?: string | null,
  targetCompanyIds: string[] = []
) {
  // Get usage logs from tracker
  let usageLogs: any[] = []
  
  if (targetCompanyIds.length === 0 || (targetCompanyIds.length === 1 && targetCompanyIds[0] === 'all')) {
    // All companies (SUPER_ADMIN only)
    usageLogs = openaiUsageTracker.getRecentUsage(10000)
  } else {
    // Filter logs for specific companies
    const allLogs = openaiUsageTracker.getRecentUsage(10000)
    usageLogs = allLogs.filter(log => 
      log.companyId && targetCompanyIds.includes(log.companyId)
    )
  }

  // Filter by date range if provided
  let filteredLogs = usageLogs
  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    
    filteredLogs = usageLogs.filter(log => {
      const logDate = new Date(log.timestamp)
      return logDate >= start && logDate <= end
    })
  }

  // Transform logs for export
  const auditData = filteredLogs.map(log => ({
    'Timestamp': new Date(log.timestamp).toLocaleString(),
    'Company ID': log.companyId || 'N/A',
    'Company Name': companies.find(c => c.id === log.companyId)?.companyName || 'N/A',
    'Application ID': log.applicationId || 'N/A',
    'User ID': log.userId || 'System',
    'AI Service': log.service || 'N/A',
    'Model': log.model || 'N/A',
    'Tokens Used': log.tokens || 0,
    'Cost ($)': parseFloat((log.cost || 0).toFixed(4)),
    'Endpoint': log.endpoint || 'N/A'
  }))

  return {
    data: auditData,
    summary: {
      totalLogs: auditData.length,
      totalCost: auditData.reduce((sum, log) => sum + (log['Cost ($)'] || 0), 0),
      totalTokens: auditData.reduce((sum, log) => sum + (log['Tokens Used'] || 0), 0),
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      },
      generatedAt: new Date().toISOString(),
      generatedBy: userRole
    }
  }
}

// Generate CSV for detailed report
function generateDetailedCSV(reportData: any): string {
  let csvContent = ''
  
  if (reportData.data && reportData.data.length > 0) {
    // Add headers
    const headers = Object.keys(reportData.data[0])
    csvContent += headers.join(',') + '\n'
    
    // Add data rows
    reportData.data.forEach((row: any) => {
      const values = headers.map(header => {
        const value = row[header]
        // Handle values with commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      })
      csvContent += values.join(',') + '\n'
    })
    
    // Add summary section
    csvContent += '\n\nSUMMARY\n'
    csvContent += 'Metric,Value\n'
    csvContent += `Total Applications,${reportData.summary.totalApplications}\n`
    csvContent += `Total Cost,$${reportData.summary.totalCost.toFixed(4)}\n`
    csvContent += `Total Tokens,${reportData.summary.totalTokens}\n`
    csvContent += `Date Range,${reportData.summary.dateRange.start} to ${reportData.summary.dateRange.end}\n`
    csvContent += `Generated By,${reportData.summary.generatedBy}\n`
    csvContent += `Generated At,${new Date(reportData.summary.generatedAt).toLocaleString()}\n`
    csvContent += `Companies Count,${reportData.summary.companiesCount}\n`
    csvContent += `All Companies,${reportData.summary.isAllCompanies ? 'Yes' : 'No'}\n`
  } else {
    csvContent = 'No data available for the selected parameters\n'
  }
  
  return csvContent
}

// Generate CSV for summary report
function generateSummaryCSV(reportData: any): string {
  let csvContent = ''
  
  if (reportData.data && reportData.data.length > 0) {
    // Add headers
    const headers = Object.keys(reportData.data[0])
    csvContent += headers.join(',') + '\n'
    
    // Add data rows
    reportData.data.forEach((row: any) => {
      const values = headers.map(header => {
        const value = row[header]
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      })
      csvContent += values.join(',') + '\n'
    })
    
    // Add overview section
    csvContent += '\n\nOVERVIEW\n'
    csvContent += 'Metric,Value\n'
    csvContent += `Total Applications,${reportData.summary.totalApplications}\n`
    csvContent += `Total Cost,$${reportData.summary.totalCost.toFixed(4)}\n`
    csvContent += `Company,${reportData.summary.company}\n`
    csvContent += `Date Range,${reportData.summary.dateRange.start} to ${reportData.summary.dateRange.end}\n`
    csvContent += `Generated By,${reportData.summary.generatedBy}\n`
    csvContent += `Generated At,${new Date(reportData.summary.generatedAt).toLocaleString()}\n`
  } else {
    csvContent = 'No data available for the selected parameters\n'
  }
  
  return csvContent
}

// Generate CSV for audit report
function generateAuditCSV(reportData: any): string {
  let csvContent = ''
  
  if (reportData.data && reportData.data.length > 0) {
    // Add headers
    const headers = Object.keys(reportData.data[0])
    csvContent += headers.join(',') + '\n'
    
    // Add data rows
    reportData.data.forEach((row: any) => {
      const values = headers.map(header => {
        const value = row[header]
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      })
      csvContent += values.join(',') + '\n'
    })
    
    // Add summary section
    csvContent += '\n\nSUMMARY\n'
    csvContent += 'Metric,Value\n'
    csvContent += `Total Logs,${reportData.summary.totalLogs}\n`
    csvContent += `Total Cost,$${reportData.summary.totalCost.toFixed(4)}\n`
    csvContent += `Total Tokens,${reportData.summary.totalTokens}\n`
    csvContent += `Date Range,${reportData.summary.dateRange.start} to ${reportData.summary.dateRange.end}\n`
    csvContent += `Generated By,${reportData.summary.generatedBy}\n`
    csvContent += `Generated At,${new Date(reportData.summary.generatedAt).toLocaleString()}\n`
  } else {
    csvContent = 'No audit logs available for the selected parameters\n'
  }
  
  return csvContent
}