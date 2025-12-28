// src/app/api/ai/cost/route.ts
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
    const period = searchParams.get('period') || 'daily'
    const companyId = searchParams.get('companyId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // SUPER_ADMIN can view any company, HR/ADMIN only their own
    let targetCompanyId: string
    
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can specify company or see all
      targetCompanyId = companyId || 'all'
    } else {
      // HR/ADMIN can only see their own company
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR/ADMIN user', 400),
          origin
        )
      }
      targetCompanyId = user.companyId
      
      // HR/ADMIN cannot view other companies even if specified
      if (companyId && companyId !== user.companyId) {
        return withCors(
          ApiResponse.error('HR/ADMIN users can only view their own company data', 403),
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

    // Get AI usage data with proper filtering
    const aiApplications = await getAIApplications(targetCompanyId, user.role === 'SUPER_ADMIN')

    // Process data based on user role and scope
    const result = await processCostData(
      companies,
      aiApplications,
      targetCompanyId,
      user.role,
      period,
      startDate,
      endDate
    )

    return withCors(
      ApiResponse.success(result, 'AI cost analysis retrieved successfully'),
      origin
    )
  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error fetching AI costs:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Helper function to get AI applications with proper filtering
async function getAIApplications(companyId: string, isSuperAdmin: boolean) {
  const whereClause: any = {
    OR: [
      // Check for reviewMethod containing 'ai'
      {
        metadata: {
          path: ['reviewMethod'],
          string_contains: 'ai'
        }
      },
      // Check for reviewedByAI flag
      {
        metadata: {
          path: ['reviewedByAI'],
          equals: true
        }
      },
      // Check for aiReview flag
      {
        metadata: {
          path: ['aiReview'],
          equals: true
        }
      },
      // Check for aiDetails.service field
      {
        metadata: {
          path: ['aiDetails', 'service'],
          not: null
        }
      },
      // Check for aiService field
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

  return await prisma.jobApplication.findMany({
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
          lastName: true
        }
      }
    },
    orderBy: {
      reviewedAt: 'desc'
    },
    take: isSuperAdmin ? 500 : 100
  })
}

// Process cost data based on role
async function processCostData(
  companies: any[],
  aiApplications: any[],
  targetCompanyId: string,
  userRole: string,
  period: string,
  startDate?: string | null,
  endDate?: string | null
) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const isAllCompanies = targetCompanyId === 'all'

  // Filter by date range if provided
  let filteredApplications = aiApplications
  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999) // End of day
    
    filteredApplications = aiApplications.filter(app => {
      const reviewDate = app.reviewedAt ? new Date(app.reviewedAt) : null
      return reviewDate && reviewDate >= start && reviewDate <= end
    })
  }

  // Process each application
  const costData = filteredApplications.map(app => {
    const metadata = app.metadata as any
    const aiDetails = metadata?.aiDetails
    
    return {
      applicationId: app.id,
      candidateName: app.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}` : 'Unknown',
      jobTitle: app.job?.title || 'Unknown',
      department: app.job?.department || 'Unknown',
      companyId: app.job?.companyId,
      companyName: app.job?.company?.companyName || 'Unknown',
      score: app.score || 0,
      aiService: aiDetails?.service || metadata?.aiService || 'unknown',
      aiModel: aiDetails?.model || metadata?.aiModel || 'unknown',
      tokensUsed: aiDetails?.tokensUsed || metadata?.tokensUsed || 0,
      estimatedCost: aiDetails?.estimatedCost || metadata?.estimatedCost || 0,
      reviewDate: app.reviewedAt?.toISOString() || new Date().toISOString(),
      timeToProductivity: aiDetails?.timeToProductivity || metadata?.timeToProductivity,
      culturalFit: aiDetails?.culturalFit || metadata?.culturalFit,
      growthPotential: aiDetails?.growthPotential || metadata?.growthPotential,
      strengths: aiDetails?.strengths || metadata?.strengths,
      weaknesses: aiDetails?.weaknesses || metadata?.weaknesses
    }
  })

  // Calculate statistics
  if (isSuperAdmin && isAllCompanies) {
    return await getSuperAdminAllCompaniesData(companies, costData, period, startDate, endDate)
  } else {
    // Pass userRole instead of isSuperAdmin
    return await getCompanySpecificData(companies[0], costData, period, userRole, startDate, endDate)
  }
}

// SUPER_ADMIN view for all companies
async function getSuperAdminAllCompaniesData(
  companies: any[], 
  costData: any[], 
  period: string,
  startDate?: string | null,
  endDate?: string | null
) {
  // Group by company
  const companyData = companies.map(company => {
    const companyApps = costData.filter(app => app.companyId === company.id)
    const totalCost = companyApps.reduce((sum, item) => sum + item.estimatedCost, 0)
    const totalApplications = companyApps.length
    const avgCostPerReview = totalApplications > 0 ? totalCost / totalApplications : 0
    const avgScore = totalApplications > 0 
      ? companyApps.reduce((sum, item) => sum + (item.score || 0), 0) / totalApplications 
      : 0

    // Get usage stats for this company
    const companyUsageStats = openaiUsageTracker.getUsageStats(company.id)

    return {
      companyId: company.id,
      companyName: company.companyName,
      totalApplications,
      totalCost: parseFloat(totalCost.toFixed(4)),
      avgCostPerReview: parseFloat(avgCostPerReview.toFixed(4)),
      avgScore: parseFloat(avgScore.toFixed(1)),
      monthlyBudget: company.aiSettings?.monthlyBudget || 100,
      budgetUsedPercent: company.aiSettings?.monthlyBudget 
        ? parseFloat(((totalCost / company.aiSettings.monthlyBudget) * 100).toFixed(1))
        : 0,
      usageStats: companyUsageStats
    }
  }).filter(company => company.totalApplications > 0) // Only show companies with usage

  // Calculate overall totals (only for SUPER_ADMIN)
  const overallTotals = {
    totalCompanies: companyData.length,
    totalApplications: costData.length,
    totalCost: parseFloat(costData.reduce((sum, item) => sum + item.estimatedCost, 0).toFixed(4)),
    avgCostPerReview: costData.length > 0 
      ? parseFloat((costData.reduce((sum, item) => sum + item.estimatedCost, 0) / costData.length).toFixed(4))
      : 0
  }

  // Get overall usage stats
  const overallUsageStats = openaiUsageTracker.getUsageStats()

  return {
    viewType: 'superadmin_all',
    userRole: 'SUPER_ADMIN',
    permissions: {
      canViewAllCompanies: true,
      canViewDetails: true,
      canExportData: true
    },
    summary: {
      ...overallTotals,
      estimatedMonthlyCost: parseFloat(overallUsageStats.monthlyEstimate),
      dailyUsage: parseFloat(overallUsageStats.dailyCost),
      totalTokens: overallUsageStats.totalTokens,
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all',
        period: period
      },
      lastUpdated: new Date().toISOString()
    },
    companies: companyData,
    companyBreakdown: companyData,
    recentActivity: costData.slice(0, 50), // SUPER_ADMIN sees more
    recommendations: generateSuperAdminRecommendations(companyData, overallTotals),
    metadata: {
      timestamp: new Date().toISOString(),
      companyCount: companyData.length,
      period: period,
      dataPoints: costData.length
    }
  }
}

// Company-specific view (for both SUPER_ADMIN viewing single company and HR/ADMIN)
async function getCompanySpecificData(
  company: any, 
  costData: any[], 
  period: string, 
  userRole: string,
  startDate?: string | null,
  endDate?: string | null
) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const totalApplications = costData.length
  const totalCost = costData.reduce((sum, item) => sum + item.estimatedCost, 0)
  const totalTokens = costData.reduce((sum, item) => sum + item.tokensUsed, 0)
  const avgCostPerReview = totalApplications > 0 ? totalCost / totalApplications : 0
  const avgScore = totalApplications > 0 
    ? costData.reduce((sum, item) => sum + (item.score || 0), 0) / totalApplications 
    : 0

  // Group by service (visible to all)
  const serviceBreakdown = costData.reduce((acc: any, item) => {
    const service = item.aiService
    if (!acc[service]) {
      acc[service] = {
        count: 0,
        totalCost: 0,
        totalTokens: 0,
        avgScore: 0,
        scores: []
      }
    }
    acc[service].count++
    acc[service].totalCost += item.estimatedCost
    acc[service].totalTokens += item.tokensUsed
    acc[service].scores.push(item.score || 0)
    return acc
  }, {})

  Object.keys(serviceBreakdown).forEach(service => {
    const data = serviceBreakdown[service]
    data.avgScore = data.scores.length > 0 
      ? data.scores.reduce((sum: number, score: number) => sum + score, 0) / data.scores.length 
      : 0
    data.avgCost = data.count > 0 ? data.totalCost / data.count : 0
    delete data.scores
  })

  // Group by department (visible to all)
  const departmentBreakdown = costData.reduce((acc: any, item) => {
    const dept = item.department || 'Unknown'
    if (!acc[dept]) {
      acc[dept] = {
        count: 0,
        totalCost: 0,
        avgScore: 0,
        scores: []
      }
    }
    acc[dept].count++
    acc[dept].totalCost += item.estimatedCost
    acc[dept].scores.push(item.score || 0)
    return acc
  }, {})

  Object.keys(departmentBreakdown).forEach(dept => {
    const data = departmentBreakdown[dept]
    data.avgScore = data.scores.length > 0 
      ? data.scores.reduce((sum: number, score: number) => sum + score, 0) / data.scores.length 
      : 0
    data.avgCost = data.count > 0 ? data.totalCost / data.count : 0
    delete data.scores
  })

  // Daily trend for last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  const dailyTrend = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const dayData = costData.filter(item => {
      const itemDate = new Date(item.reviewDate).toISOString().split('T')[0]
      return itemDate === dateStr
    })
    
    return {
      date: dateStr,
      count: dayData.length,
      totalCost: dayData.reduce((sum, item) => sum + item.estimatedCost, 0),
      avgScore: dayData.length > 0 
        ? dayData.reduce((sum, item) => sum + (item.score || 0), 0) / dayData.length 
        : 0
    }
  }).reverse()

  // Get usage stats for this company
  const companyUsageStats = openaiUsageTracker.getUsageStats(company.id)

  return {
    viewType: 'company_specific',
    userRole: userRole,
    permissions: {
      canViewAllCompanies: isSuperAdmin,
      canViewDetails: true,
      canExportData: true,
      canManageSettings: isSuperAdmin || userRole === 'ADMIN'
    },
    company: {
      id: company.id,
      name: company.companyName,
      monthlyBudget: company.aiSettings?.monthlyBudget || 100,
      budgetUsedPercent: company.aiSettings?.monthlyBudget 
        ? parseFloat(((totalCost / company.aiSettings.monthlyBudget) * 100).toFixed(1))
        : parseFloat(((totalCost / 100) * 100).toFixed(1)),
      alertThreshold: company.aiSettings?.costAlertThreshold || 80
    },
    summary: {
      totalApplications,
      totalCost: parseFloat(totalCost.toFixed(4)),
      totalTokens,
      avgCostPerReview: parseFloat(avgCostPerReview.toFixed(4)),
      avgScore: parseFloat(avgScore.toFixed(1)),
      estimatedMonthlyCost: parseFloat(companyUsageStats.monthlyEstimate),
      dailyUsage: parseFloat(companyUsageStats.dailyCost),
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all',
        period: period
      },
      lastUpdated: new Date().toISOString()
    },
    breakdown: {
      byService: serviceBreakdown,
      byDepartment: departmentBreakdown
    },
    trends: {
      daily: dailyTrend
    },
    recentActivity: costData.slice(0, 25),
    recommendations: generateCompanyRecommendations(totalCost, avgCostPerReview, totalApplications),
    metadata: {
      timestamp: new Date().toISOString(),
      period: period,
      isSuperAdminView: isSuperAdmin,
      dataPoints: costData.length
    }
  }
}

function generateSuperAdminRecommendations(companyData: any[], totals: any): string[] {
  const recommendations: string[] = []
  
  // Identify companies with high costs
  const highCostCompanies = companyData.filter(c => c.totalCost > 50)
  if (highCostCompanies.length > 0) {
    recommendations.push(`Companies with high AI costs (>$50): ${highCostCompanies.map(c => c.companyName).join(', ')}`)
  }
  
  // Check for budget overruns
  const overBudgetCompanies = companyData.filter(c => c.budgetUsedPercent > 100)
  if (overBudgetCompanies.length > 0) {
    recommendations.push(`⚠️ Companies over budget: ${overBudgetCompanies.map(c => c.companyName).join(', ')}`)
  }
  
  // Check for near-limit companies
  const nearLimitCompanies = companyData.filter(c => c.budgetUsedPercent > 90 && c.budgetUsedPercent <= 100)
  if (nearLimitCompanies.length > 0) {
    recommendations.push(`⚠️ Companies near budget limit (>90%): ${nearLimitCompanies.map(c => c.companyName).join(', ')}`)
  }
  
  // Overall recommendations
  if (totals.avgCostPerReview > 0.03) {
    recommendations.push('Consider recommending GPT-3.5-turbo to high-cost companies for initial screening')
  }
  
  if (totals.totalCost > 100) {
    recommendations.push('Consider implementing company-wide budget policies')
    recommendations.push('Review usage patterns across companies for optimization opportunities')
  }
  
  // Identify low-usage companies
  const lowUsageCompanies = companyData.filter(c => c.totalApplications < 10)
  if (lowUsageCompanies.length > 0) {
    recommendations.push(`Companies with low AI usage (<10 reviews): ${lowUsageCompanies.map(c => c.companyName).join(', ')} - they might need training on AI features`)
  }
  
  recommendations.push('Monitor ROI: High AI cost should correlate with better candidate quality')
  recommendations.push('Consider enterprise pricing if total monthly costs exceed $500')
  
  return recommendations
}

function generateCompanyRecommendations(totalCost: number, avgCostPerReview: number, totalReviews: number): string[] {
  const recommendations: string[] = []
  
  if (avgCostPerReview > 0.05) {
    recommendations.push('💰 Consider using GPT-3.5-turbo for initial screening to reduce costs by 80%')
  }
  
  if (totalReviews > 100 && totalCost > 10) {
    recommendations.push('⚡ Implement bulk processing to reduce per-review API calls')
  }
  
  if (totalCost > 50) {
    recommendations.push('💾 Consider caching frequent queries to reduce API calls')
    recommendations.push('📊 Review which departments have highest costs for optimization')
  }
  
  if (avgCostPerReview < 0.01) {
    recommendations.push('✅ Current cost efficiency is good. Consider enabling detailed analysis for key roles only')
  }
  
  if (totalReviews > 200) {
    recommendations.push('🎯 Focus AI analysis on senior/technical roles, use standard algorithm for junior positions')
  }
  
  recommendations.push('📈 Review candidate quality vs cost: Higher cost should mean better candidate matches')
  recommendations.push('🔧 Use industry-standard algorithm for low-priority roles to save costs')
  
  if (totalCost > 100) {
    recommendations.push('🚨 Consider setting up budget alerts in AI Settings dashboard')
  }
  
  return recommendations
}