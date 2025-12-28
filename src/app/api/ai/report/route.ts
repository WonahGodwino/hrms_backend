// src/app/api/ai/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { openaiUsageTracker } from '@/app/lib/openaiUsage'

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
    const user = getUserFromToken(token)
    
    // Check permissions
    if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'HR' && user.role !== 'ADMIN')) {
      return withCors(
        ApiResponse.error('Insufficient permissions. Required role: SUPER_ADMIN, HR, or ADMIN', 403),
        origin
      )
    }

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

    // SUPER_ADMIN can export any company, HR/ADMIN only their own
    let targetCompanyId: string
    
    if (user.role === 'SUPER_ADMIN') {
      targetCompanyId = companyId || 'all'
    } else {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR/ADMIN user', 400),
          origin
        )
      }
      targetCompanyId = user.companyId
      
      if (companyId && companyId !== user.companyId) {
        return withCors(
          ApiResponse.error('HR/ADMIN users can only export their own company data', 403),
          origin
        )
      }
    }

    // Get company/companies info
    let companies: any[] = []
    if (targetCompanyId === 'all') {
      companies = await prisma.company.findMany({
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
      const company = await prisma.company.findUnique({
        where: { id: targetCompanyId },
        select: { 
          id: true, 
          companyName: true,
          aiSettings: {
            select: {
              monthlyBudget: true,
              costAlertThreshold: true
            }
          }
        }
      })
      
      if (!company) {
        return withCors(
          ApiResponse.error('Company not found', 404),
          origin
        )
      }
      companies = [company]
    }

    // Get AI usage data
    const aiApplications = await getAIApplications(targetCompanyId, user.role === 'SUPER_ADMIN')
    
    // Process data based on report type
    let reportData: any
    let csvContent: string
    let filename: string
    
    const timestamp = new Date().toISOString().split('T')[0]
    const companyName = targetCompanyId === 'all' 
      ? 'all-companies' 
      : companies[0]?.companyName?.replace(/\s+/g, '-').toLowerCase() || 'company'

    switch (reportType) {
      case 'summary':
        reportData = await generateSummaryReport(companies, aiApplications, user.role, startDate, endDate)
        csvContent = generateSummaryCSV(reportData)
        filename = `ai-cost-summary-${companyName}-${timestamp}.csv`
        break
      case 'audit':
        reportData = await generateAuditReport(companies, user.role, startDate, endDate)
        csvContent = generateAuditCSV(reportData)
        filename = `ai-cost-audit-${companyName}-${timestamp}.csv`
        break
      case 'detailed':
      default:
        reportData = await generateDetailedReport(companies, aiApplications, user.role, startDate, endDate)
        csvContent = generateDetailedCSV(reportData)
        filename = `ai-cost-detailed-${companyName}-${timestamp}.csv`
        break
    }

    // Convert to Uint8Array for NextResponse
    const encoder = new TextEncoder()
    const fileData = encoder.encode(csvContent)
    
    // Return file as response
    return new NextResponse(fileData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })

  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error generating AI cost report:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Helper function to get AI applications with proper filtering
async function getAIApplications(companyId: string, isSuperAdmin: boolean) {
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

  if (companyId !== 'all') {
    whereClause.job = {
      companyId: companyId
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
  endDate?: string | null
) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  
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
      generatedBy: userRole
    }
  }
}

// Generate summary report
async function generateSummaryReport(
  companies: any[], 
  aiApplications: any[], 
  userRole: string,
  startDate?: string | null,
  endDate?: string | null
) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  
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
  
  if (isSuperAdmin && companies.length > 1) {
    // SUPER_ADMIN all companies view
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
      company: companies[0]?.companyName || 'Multiple Companies'
    }
  }
}

// Generate audit report
async function generateAuditReport(
  companies: any[], 
  userRole: string,
  startDate?: string | null,
  endDate?: string | null
) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const targetCompanyId = companies.length === 1 ? companies[0].id : 'all'
  
  // Get usage logs from tracker
  let usageLogs: any[] = []
  if (targetCompanyId === 'all') {
    usageLogs = openaiUsageTracker.getRecentUsage(10000)
  } else {
    usageLogs = openaiUsageTracker.getRecentUsage(5000, targetCompanyId)
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
    'Application ID': log.applicationId || 'N/A',
    'User ID': log.userId || 'System',
    'AI Service': log.endpoint || 'N/A',
    'Model': log.model || 'N/A',
    'Tokens Used': log.tokens || 0,
    'Cost ($)': parseFloat(log.cost.toFixed(4)),
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