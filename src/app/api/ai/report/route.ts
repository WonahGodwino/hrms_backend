// src/app/api/ai/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import * as XLSX from 'xlsx'
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
    const format = searchParams.get('format') || 'csv' // csv or excel
    const companyId = searchParams.get('companyId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const reportType = searchParams.get('type') || 'detailed' // detailed, summary, or audit

    // SUPER_ADMIN can export any company, HR/ADMIN only their own
    let targetCompanyId: string
    
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can specify company or see all
      targetCompanyId = companyId || 'all'
    } else {
      // HR/ADMIN can only export their own company
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR/ADMIN user', 400),
          origin
        )
      }
      targetCompanyId = user.companyId
      
      // HR/ADMIN cannot export other companies even if specified
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
      // SUPER_ADMIN viewing all companies
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
      // Single company view
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
    switch (reportType) {
      case 'summary':
        reportData = await generateSummaryReport(companies, aiApplications, user.role, startDate, endDate)
        break
      case 'audit':
        reportData = await generateAuditReport(companies, aiApplications, user.role, startDate, endDate)
        break
      case 'detailed':
      default:
        reportData = await generateDetailedReport(companies, aiApplications, user.role, startDate, endDate)
        break
    }

    // Generate file based on format
    let fileBuffer: Buffer
    let contentType: string
    let filename: string

    const timestamp = new Date().toISOString().split('T')[0]
    const companyName = targetCompanyId === 'all' 
      ? 'all-companies' 
      : companies[0]?.companyName?.replace(/\s+/g, '-').toLowerCase() || 'company'

    if (format === 'excel') {
      const workbook = await generateExcelWorkbook(reportData, reportType, user.role, targetCompanyId)
      fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      filename = `ai-cost-${reportType}-report-${companyName}-${timestamp}.xlsx`
    } else {
      // CSV format
      const csvContent = generateCSV(reportData, reportType)
      fileBuffer = Buffer.from(csvContent, 'utf-8')
      contentType = 'text/csv'
      filename = `ai-cost-${reportType}-report-${companyName}-${timestamp}.csv`
    }

    // Return file as response
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
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
    metadata: {
      not: null
    }
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
      updatedAt: true,
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
      updatedAt: 'desc'
    },
    take: isSuperAdmin ? 10000 : 5000 // SUPER_ADMIN can export more records
  })

  // Filter in memory for AI-reviewed applications
  return applications.filter(app => {
    const metadata = app.metadata as any
    return metadata?.reviewMethod?.includes('ai-') || 
           metadata?.aiDetails?.service || 
           metadata?.reviewedByAI === true ||
           metadata?.aiReview === true
  })
}

// Generate detailed report with all application data
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
      const reviewDate = app.updatedAt ? new Date(app.updatedAt) : null
      return reviewDate && reviewDate >= start && reviewDate <= end
    })
  }

  // Transform data for export
  const detailedData = filteredApplications.map(app => {
    const metadata = app.metadata as any
    const aiDetails = metadata?.aiDetails
    
    return {
      'Application ID': app.id,
      'Review Date': app.updatedAt ? new Date(app.updatedAt).toLocaleDateString() : 'N/A',
      'Review Time': app.updatedAt ? new Date(app.updatedAt).toLocaleTimeString() : 'N/A',
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
  })

  // Calculate summary statistics
  const totalCost = detailedData.reduce((sum, item) => sum + (item['Cost ($)'] || 0), 0)
  const totalApplications = detailedData.length
  const totalTokens = detailedData.reduce((sum, item) => sum + (item['Tokens Used'] || 0), 0)
  const avgScore = totalApplications > 0 
    ? detailedData.reduce((sum, item) => sum + (item['Score (%)'] || 0), 0) / totalApplications 
    : 0

  return {
    detailed: detailedData,
    summary: {
      totalApplications,
      totalCost: parseFloat(totalCost.toFixed(4)),
      totalTokens,
      avgScore: parseFloat(avgScore.toFixed(1)),
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      },
      generatedAt: new Date().toISOString(),
      generatedBy: userRole
    },
    metadata: {
      isSuperAdmin,
      companyCount: companies.length,
      reportType: 'detailed'
    }
  }
}

// Generate summary report with aggregated data
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
      const reviewDate = app.updatedAt ? new Date(app.updatedAt) : null
      return reviewDate && reviewDate >= start && reviewDate <= end
    })
  }

  // Group data based on user role
  let summaryData: any[]
  
  if (isSuperAdmin && companies.length > 1) {
    // SUPER_ADMIN all companies view - group by company
    const companyMap = new Map()
    
    companies.forEach(company => {
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
      
      companyMap.set(company.id, {
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
      })
    })
    
    summaryData = Array.from(companyMap.values())
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

  // Calculate overall totals
  const totalCost = filteredApplications.reduce((sum, app) => {
    const metadata = app.metadata as any
    const aiDetails = metadata?.aiDetails
    return sum + (aiDetails?.estimatedCost || metadata?.estimatedCost || 0)
  }, 0)

  return {
    summary: summaryData,
    overview: {
      totalApplications: filteredApplications.length,
      totalCost: parseFloat(totalCost.toFixed(4)),
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      },
      generatedAt: new Date().toISOString(),
      generatedBy: userRole,
      company: companies[0]?.companyName || 'Multiple Companies'
    },
    metadata: {
      isSuperAdmin,
      companyCount: companies.length,
      reportType: 'summary'
    }
  }
}

// Generate audit report with usage logs
async function generateAuditReport(
  companies: any[], 
  aiApplications: any[], 
  userRole: string,
  startDate?: string | null,
  endDate?: string | null
) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  
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
    'Endpoint': log.endpoint || 'N/A',
    'Input Length': log.inputLength || 0,
    'Output Length': log.outputLength || 0
  }))

  // Get company breakdown for SUPER_ADMIN
  let companyBreakdown: any[] = []
  if (isSuperAdmin && companies.length > 1) {
    const breakdown = openaiUsageTracker.getCompanyBreakdown()
    companyBreakdown = Object.entries(breakdown).map(([companyId, data]: [string, any]) => {
      const company = companies.find(c => c.id === companyId)
      return {
        'Company': company?.companyName || companyId,
        'API Calls': data.count,
        'Total Cost ($)': parseFloat(data.totalCost.toFixed(4)),
        'Total Tokens': data.totalTokens,
        'Average Cost/Call ($)': parseFloat((data.totalCost / data.count).toFixed(4))
      }
    })
  }

  return {
    auditLogs: auditData,
    companyBreakdown: companyBreakdown,
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
    },
    metadata: {
      isSuperAdmin,
      companyCount: companies.length,
      reportType: 'audit'
    }
  }
}

// Generate Excel workbook with multiple sheets
async function generateExcelWorkbook(reportData: any, reportType: string, userRole: string, targetCompanyId: string) {
  const workbook = XLSX.utils.book_new()
  
  switch (reportType) {
    case 'detailed':
      if (reportData.detailed && reportData.detailed.length > 0) {
        const detailedSheet = XLSX.utils.json_to_sheet(reportData.detailed)
        XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Detailed Applications')
        
        // Add summary sheet
        const summaryData = [
          { 'Metric': 'Total Applications', 'Value': reportData.summary.totalApplications },
          { 'Metric': 'Total Cost ($)', 'Value': reportData.summary.totalCost },
          { 'Metric': 'Total Tokens', 'Value': reportData.summary.totalTokens },
          { 'Metric': 'Average Score (%)', 'Value': reportData.summary.avgScore },
          { 'Metric': 'Date Range', 'Value': `${reportData.summary.dateRange.start} to ${reportData.summary.dateRange.end}` },
          { 'Metric': 'Generated By', 'Value': reportData.summary.generatedBy },
          { 'Metric': 'Generated At', 'Value': new Date(reportData.summary.generatedAt).toLocaleString() }
        ]
        const summarySheet = XLSX.utils.json_to_sheet(summaryData)
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
      }
      break
      
    case 'summary':
      if (reportData.summary && reportData.summary.length > 0) {
        const summarySheet = XLSX.utils.json_to_sheet(reportData.summary)
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
        
        // Add overview sheet
        const overviewData = [
          { 'Metric': 'Total Applications', 'Value': reportData.overview.totalApplications },
          { 'Metric': 'Total Cost ($)', 'Value': reportData.overview.totalCost },
          { 'Metric': 'Company', 'Value': reportData.overview.company },
          { 'Metric': 'Date Range', 'Value': `${reportData.overview.dateRange.start} to ${reportData.overview.dateRange.end}` },
          { 'Metric': 'Generated By', 'Value': reportData.overview.generatedBy },
          { 'Metric': 'Generated At', 'Value': new Date(reportData.overview.generatedAt).toLocaleString() }
        ]
        const overviewSheet = XLSX.utils.json_to_sheet(overviewData)
        XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview')
      }
      break
      
    case 'audit':
      if (reportData.auditLogs && reportData.auditLogs.length > 0) {
        const auditSheet = XLSX.utils.json_to_sheet(reportData.auditLogs)
        XLSX.utils.book_append_sheet(workbook, auditSheet, 'Audit Logs')
        
        if (reportData.companyBreakdown && reportData.companyBreakdown.length > 0) {
          const breakdownSheet = XLSX.utils.json_to_sheet(reportData.companyBreakdown)
          XLSX.utils.book_append_sheet(workbook, breakdownSheet, 'Company Breakdown')
        }
        
        // Add summary sheet
        const summaryData = [
          { 'Metric': 'Total Logs', 'Value': reportData.summary.totalLogs },
          { 'Metric': 'Total Cost ($)', 'Value': reportData.summary.totalCost },
          { 'Metric': 'Total Tokens', 'Value': reportData.summary.totalTokens },
          { 'Metric': 'Date Range', 'Value': `${reportData.summary.dateRange.start} to ${reportData.summary.dateRange.end}` },
          { 'Metric': 'Generated By', 'Value': reportData.summary.generatedBy },
          { 'Metric': 'Generated At', 'Value': new Date(reportData.summary.generatedAt).toLocaleString() }
        ]
        const summarySheet = XLSX.utils.json_to_sheet(summaryData)
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
      }
      break
  }
  
  return workbook
}

// Generate CSV content
function generateCSV(reportData: any, reportType: string): string {
  let csvContent = ''
  
  switch (reportType) {
    case 'detailed':
      if (reportData.detailed && reportData.detailed.length > 0) {
        // Add headers
        const headers = Object.keys(reportData.detailed[0])
        csvContent += headers.join(',') + '\n'
        
        // Add data rows
        reportData.detailed.forEach((row: any) => {
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
        csvContent += `Total Cost ($${reportData.summary.totalCost}\n`
        csvContent += `Total Tokens,${reportData.summary.totalTokens}\n`
        csvContent += `Average Score (%),${reportData.summary.avgScore}\n`
        csvContent += `Date Range,${reportData.summary.dateRange.start} to ${reportData.summary.dateRange.end}\n`
        csvContent += `Generated By,${reportData.summary.generatedBy}\n`
        csvContent += `Generated At,${new Date(reportData.summary.generatedAt).toLocaleString()}\n`
      }
      break
      
    case 'summary':
      if (reportData.summary && reportData.summary.length > 0) {
        // Add headers
        const headers = Object.keys(reportData.summary[0])
        csvContent += headers.join(',') + '\n'
        
        // Add data rows
        reportData.summary.forEach((row: any) => {
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
        csvContent += `Total Applications,${reportData.overview.totalApplications}\n`
        csvContent += `Total Cost ($${reportData.overview.totalCost}\n`
        csvContent += `Company,${reportData.overview.company}\n`
        csvContent += `Date Range,${reportData.overview.dateRange.start} to ${reportData.overview.dateRange.end}\n`
        csvContent += `Generated By,${reportData.overview.generatedBy}\n`
        csvContent += `Generated At,${new Date(reportData.overview.generatedAt).toLocaleString()}\n`
      }
      break
      
    case 'audit':
      if (reportData.auditLogs && reportData.auditLogs.length > 0) {
        // Add headers
        const headers = Object.keys(reportData.auditLogs[0])
        csvContent += headers.join(',') + '\n'
        
        // Add data rows
        reportData.auditLogs.forEach((row: any) => {
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
        csvContent += `Total Cost ($${reportData.summary.totalCost}\n`
        csvContent += `Total Tokens,${reportData.summary.totalTokens}\n`
        csvContent += `Date Range,${reportData.summary.dateRange.start} to ${reportData.summary.dateRange.end}\n`
        csvContent += `Generated By,${reportData.summary.generatedBy}\n`
        csvContent += `Generated At,${new Date(reportData.summary.generatedAt).toLocaleString()}\n`
      }
      break
  }
  
  return csvContent
}

// Helper variable for audit report function
let targetCompanyId: string