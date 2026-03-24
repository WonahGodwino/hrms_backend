// src/components/AdminAICostDashboard.tsx
'use client'

import { useState, useEffect } from 'react'
import { Download, RefreshCw, AlertTriangle, TrendingUp, DollarSign, Users, BarChart2 } from 'lucide-react'

interface AICostData {
  viewType: 'superadmin_all' | 'company_specific'
  userRole: string
  permissions: {
    canViewAllCompanies: boolean
    canViewDetails: boolean
    canExportData: boolean
    canManageSettings?: boolean
  }
  company?: {
    id: string
    name: string
    monthlyBudget: number
    budgetUsedPercent: number
    alertThreshold: number
  }
  companies?: Array<{
    companyId: string
    companyName: string
    totalApplications: number
    totalCost: number
    avgCostPerReview: number
    avgScore: number
    monthlyBudget: number
    budgetUsedPercent: number
    usageStats?: {
      dailyCost: string
      monthlyEstimate: string
      totalCost: string
      totalTokens: number
    }
  }>
  summary: {
    totalApplications: number
    totalCost: number
    totalTokens?: number
    avgCostPerReview: number
    avgScore: number
    estimatedMonthlyCost: number
    dailyUsage: number
    totalCompanies?: number
    dateRange: {
      start: string
      end: string
      period: string
    }
    lastUpdated: string
  }
  breakdown?: {
    byService: Record<string, {
      count: number
      totalCost: number
      totalTokens: number
      avgScore: number
      avgCost: number
    }>
    byDepartment: Record<string, {
      count: number
      totalCost: number
      avgScore: number
      avgCost: number
    }>
  }
  trends?: {
    daily: Array<{
      date: string
      count: number
      totalCost: number
      avgScore: number
    }>
  }
  recentActivity: Array<{
    applicationId: string
    candidateName: string
    jobTitle: string
    department: string
    companyId?: string
    companyName?: string
    score: number
    aiService: string
    aiModel: string
    tokensUsed: number
    estimatedCost: number
    reviewDate: string
    timeToProductivity?: number
    culturalFit?: string
    growthPotential?: number
  }>
  recommendations: string[]
  metadata: {
    timestamp: string
    period: string
    companyCount?: number
    dataPoints: number
    isSuperAdminView?: boolean
  }
}

export function AdminAICostDashboard() {
  const [data, setData] = useState<AICostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('daily')
  const [selectedCompany, setSelectedCompany] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string>('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const savedToken = localStorage.getItem('hrms_token')
    if (savedToken) setToken(savedToken)
    
    // Set default date range to last 30 days
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    if (!token) return
    
    fetchAICostData()
  }, [token, period, selectedCompany, startDate, endDate])

  const fetchAICostData = async () => {
    setLoading(true)
    setError('')
    try {
      let url = `/api/ai/cost?period=${period}`
      if (selectedCompany && selectedCompany !== 'all') {
        url += `&companyId=${selectedCompany}`
      }
      if (startDate) {
        url += `&startDate=${startDate}`
      }
      if (endDate) {
        url += `&endDate=${endDate}`
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      const result = await response.json()
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.message || 'Failed to fetch data')
      }
    } catch (error) {
      console.error('Error fetching AI cost data:', error)
      setError(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleExportData = async () => {
    if (!data) return
    
    setExporting(true)
    try {
      const exportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          period: data.metadata.period,
          viewType: data.viewType,
          userRole: data.userRole
        },
        summary: data.summary,
        ...(data.companies && { companies: data.companies }),
        ...(data.company && { company: data.company }),
        ...(data.breakdown && { breakdown: data.breakdown }),
        recommendations: data.recommendations,
        recentActivity: data.recentActivity
      }
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ai-cost-report-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting data:', error)
      setError('Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  // Simple chart rendering without Recharts
  const renderSimpleBarChart = (title: string, data: Array<{name: string, value: number, color?: string}>) => {
    const maxValue = Math.max(...data.map(d => d.value), 1)
    
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-700">{title}</h4>
        <div className="space-y-3">
          {data.map((item, index) => (
            <div key={index} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-700">{item.name}</span>
                <span className="text-gray-900">${item.value.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${item.color || 'bg-blue-500'}`}
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Render daily trends
  const renderDailyTrends = () => {
    if (!data?.trends?.daily) return null
    
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-700">Daily Activity Trend</h4>
        <div className="space-y-3">
          {data.trends.daily.map((day, index) => (
            <div key={index} className="space-y-1">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-sm text-gray-900">
                  ${day.totalCost.toFixed(3)} • {day.count} reviews
                </span>
              </div>
              <div className="flex space-x-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-green-500"
                    style={{ width: `${(day.count / Math.max(...data.trends!.daily.map(d => d.count))) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                Avg Score: {day.avgScore.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Render service breakdown
  const renderServiceBreakdown = () => {
    if (!data?.breakdown?.byService) return null
    
    const serviceData = Object.entries(data.breakdown.byService)
      .sort(([, a], [, b]) => b.totalCost - a.totalCost)
      .map(([service, details]) => ({
        name: service.toUpperCase(),
        value: details.totalCost,
        count: details.count,
        avgCost: details.avgCost,
        tokens: details.totalTokens
      }))
    
    const totalCost = serviceData.reduce((sum, item) => sum + item.value, 0)
    
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-700">Cost by AI Service</h4>
        <div className="space-y-3">
          {serviceData.map((service, index) => (
            <div key={index} className="space-y-1">
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">{service.name}</span>
                <span className="text-gray-900">${service.value.toFixed(2)} ({(service.value / totalCost * 100).toFixed(0)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full bg-blue-500"
                  style={{ width: `${(service.value / totalCost) * 100}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500">
                {service.count} reviews • ${service.avgCost.toFixed(3)} avg • {service.tokens.toLocaleString()} tokens
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Render department breakdown
  const renderDepartmentBreakdown = () => {
    if (!data?.breakdown?.byDepartment) return null
    
    const deptData = Object.entries(data.breakdown.byDepartment)
      .sort(([, a], [, b]) => b.totalCost - a.totalCost)
      .map(([dept, details]) => ({
        name: dept,
        value: details.totalCost,
        count: details.count,
        avgScore: details.avgScore,
        avgCost: details.avgCost
      }))
    
    const totalCost = deptData.reduce((sum, item) => sum + item.value, 0)
    
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-700">Cost by Department</h4>
        <div className="space-y-3">
          {deptData.map((dept, index) => (
            <div key={index} className="space-y-1">
              <div className="flex justify-between">
                <span className="font-medium text-gray-700">{dept.name}</span>
                <span className="text-gray-900">${dept.value.toFixed(2)} ({(dept.value / totalCost * 100).toFixed(0)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full bg-purple-500"
                  style={{ width: `${(dept.value / totalCost) * 100}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500">
                {dept.count} reviews • ${dept.avgCost.toFixed(3)} avg • Score: {dept.avgScore.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">Loading AI cost analytics...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={fetchAICostData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <BarChart2 className="h-16 w-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h2>
        <p className="text-gray-600">Start using AI reviews to see cost analytics</p>
      </div>
    )
  }

  const isSuperAdmin = data.userRole === 'SUPER_ADMIN'
  const isAllCompaniesView = data.viewType === 'superadmin_all'
  const hasRecentActivity = data.recentActivity.length > 0
  const isNearBudget = data.company?.budgetUsedPercent && data.company.budgetUsedPercent >= 90
  const isOverBudget = data.company?.budgetUsedPercent && data.company.budgetUsedPercent > 100

  return (
    <div className="space-y-6 p-4 md:p-6 bg-gray-50 min-h-screen">
      {/* Header with Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isSuperAdmin ? 'AI Cost Analytics Dashboard' : 'Company AI Cost Analytics'}
                </h1>
                <p className="text-gray-600">
                  {isSuperAdmin 
                    ? 'Track AI costs and usage across all companies' 
                    : `Tracking AI costs for ${data.company?.name}`}
                </p>
              </div>
            </div>
            
            {/* Budget Status */}
            {data.company && (
              <div className="flex flex-wrap gap-4 mt-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">Monthly Budget:</span>
                  <span className="font-semibold text-gray-900">${data.company.monthlyBudget.toFixed(2)}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">Budget Used:</span>
                  <span className={`font-semibold ${
                    isOverBudget ? 'text-red-600' :
                    isNearBudget ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {data.company.budgetUsedPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">Alert Threshold:</span>
                  <span className="font-semibold text-gray-900">{data.company.alertThreshold}%</span>
                </div>
              </div>
            )}
          </div>
          
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Date Range */}
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            {/* Company Selector for SUPER_ADMIN */}
            {isSuperAdmin && data.companies && (
              <select 
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Companies</option>
                <option value="with-activity">Companies with Activity</option>
                {data.companies.map(company => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.companyName}
                  </option>
                ))}
              </select>
            )}
            
            {/* Period Selector */}
            <select 
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="daily">Daily View</option>
              <option value="weekly">Weekly View</option>
              <option value="monthly">Monthly View</option>
            </select>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={fetchAICostData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              
              {data.permissions.canExportData && (
                <button
                  onClick={handleExportData}
                  disabled={exporting}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total Cost Card */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-blue-700">Total Cost</p>
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${isAllCompaniesView 
                ? data.summary.totalCost?.toFixed(2) || '0.00'
                : data.summary.totalCost?.toFixed(2) || '0.00'
              }
            </p>
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-600">
                {isAllCompaniesView 
                  ? `Across ${data.companies?.length || 0} companies`
                  : `${data.summary.totalApplications} reviews`
                }
              </p>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          
          {/* Average Cost Card */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-green-700">
                {isAllCompaniesView ? 'Total Reviews' : 'Avg Cost/Review'}
              </p>
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {isAllCompaniesView 
                ? data.summary.totalApplications || 0
                : `$${data.summary.avgCostPerReview?.toFixed(3) || '0.000'}`
              }
            </p>
            <p className="text-xs text-gray-600 mt-2">
              {isAllCompaniesView 
                ? 'AI reviews processed'
                : 'Per candidate review'
              }
            </p>
          </div>
          
          {/* Quality Score Card */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-purple-700">Average Quality Score</p>
              <BarChart2 className="h-5 w-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {data.summary.avgScore?.toFixed(1) || '0.0'}
              <span className="text-sm text-gray-500 ml-1">%</span>
            </p>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    data.summary.avgScore >= 80 ? 'bg-green-500' :
                    data.summary.avgScore >= 60 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(data.summary.avgScore, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
          
          {/* Monthly Estimate Card */}
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-orange-700">Monthly Estimate</p>
              <TrendingUp className="h-5 w-5 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${data.summary.estimatedMonthlyCost?.toFixed(2) || '0.00'}
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Based on {period} usage pattern
            </p>
          </div>
        </div>
        
        {/* Date Range Info */}
        <div className="text-sm text-gray-500 border-t border-gray-200 pt-4">
          Showing data from <span className="font-semibold">{data.summary.dateRange.start}</span> to{' '}
          <span className="font-semibold">{data.summary.dateRange.end}</span> ({data.summary.dateRange.period} view)
          {data.metadata.dataPoints > 0 && (
            <span className="ml-4">
              • {data.metadata.dataPoints} data points
            </span>
          )}
        </div>
      </div>

      {/* SUPER_ADMIN All Companies View */}
      {isAllCompaniesView && data.companies && data.companies.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Company Cost Breakdown</h3>
            <div className="text-sm text-gray-500">
              Showing {data.companies.length} companies with AI activity
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reviews
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Cost/Review
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quality Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Budget Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.companies.map((company) => {
                  const isCompanyOverBudget = company.budgetUsedPercent > 100
                  const isCompanyNearBudget = company.budgetUsedPercent > 90 && company.budgetUsedPercent <= 100
                  
                  return (
                    <tr 
                      key={company.companyId}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          <div className="h-10 w-10 flex-shrink-0 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center">
                            <span className="text-blue-700 font-bold">
                              {company.companyName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {company.companyName}
                            </div>
                            <div className="text-xs text-gray-500">
                              Budget: ${company.monthlyBudget.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900 font-medium">
                          {company.totalApplications}
                        </div>
                        {company.usageStats && (
                          <div className="text-xs text-gray-500">
                            {company.usageStats.totalTokens.toLocaleString()} tokens
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          ${company.totalCost.toFixed(2)}
                        </div>
                        {company.usageStats && (
                          <div className="text-xs text-gray-500">
                            ${parseFloat(company.usageStats.dailyCost).toFixed(2)} daily
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">
                          ${company.avgCostPerReview.toFixed(3)}
                        </div>
                        <div className="text-xs text-gray-500">
                          per review
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          <span className={`text-sm font-semibold ${
                            company.avgScore >= 80 ? 'text-green-600' :
                            company.avgScore >= 60 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {company.avgScore.toFixed(1)}%
                          </span>
                          <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                company.avgScore >= 80 ? 'bg-green-500' :
                                company.avgScore >= 60 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(company.avgScore, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Usage</span>
                            <span className={`text-xs font-semibold ${
                              isCompanyOverBudget ? 'text-red-600' :
                              isCompanyNearBudget ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              {company.budgetUsedPercent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                isCompanyOverBudget ? 'bg-red-500' :
                                isCompanyNearBudget ? 'bg-yellow-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(company.budgetUsedPercent, 100)}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-500">
                            {isCompanyOverBudget ? 'Over Budget' :
                             isCompanyNearBudget ? 'Near Limit' :
                             'Normal'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => setSelectedCompany(company.companyId)}
                          className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {/* Summary Stats for All Companies */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{data.companies.length}</div>
                <div className="text-xs text-gray-500">Active Companies</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">
                  ${data.companies.reduce((sum, c) => sum + c.totalCost, 0).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Total Spend</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">
                  {data.companies.reduce((sum, c) => sum + c.totalApplications, 0)}
                </div>
                <div className="text-xs text-gray-500">Total Reviews</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">
                  {data.companies.filter(c => c.budgetUsedPercent > 90).length}
                </div>
                <div className="text-xs text-gray-500">Companies Near/Over Budget</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Company-Specific Data */}
      {!isAllCompaniesView && data.breakdown && data.trends && (
        <>
          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Cost and Activity Trend */}
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Activity Trend</h3>
              <div className="h-80">
                {renderDailyTrends()}
              </div>
            </div>

            {/* Service Breakdown */}
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost by AI Service</h3>
              <div className="h-80">
                {renderServiceBreakdown()}
              </div>
            </div>
          </div>

          {/* Department Breakdown */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost by Department</h3>
            <div className="h-96">
              {renderDepartmentBreakdown()}
            </div>
          </div>
        </>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isAllCompaniesView ? 'System-Wide Recommendations' : 'Cost Optimization Recommendations'}
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.recommendations.map((rec, index) => (
              <div 
                key={index}
                className={`p-4 rounded-lg border ${
                  rec.includes('⚠️') ? 'bg-red-50 border-red-200' :
                  rec.includes('💰') ? 'bg-green-50 border-green-200' :
                  'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
                    rec.includes('⚠️') ? 'bg-red-100 text-red-600' :
                    rec.includes('💰') ? 'bg-green-100 text-green-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {rec.includes('⚠️') ? '!' : '✓'}
                  </div>
                  <p className="text-sm text-gray-700">{rec.replace(/[⚠️💰⚡💾📊✅🎯🔧🚨]/g, '').trim()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {hasRecentActivity && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {isAllCompaniesView ? 'Recent AI Reviews Across Companies' : 'Recent AI Reviews'}
            </h3>
            <span className="text-sm text-gray-500">
              Showing {Math.min(data.recentActivity.length, 10)} of {data.recentActivity.length} reviews
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  {isAllCompaniesView && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job / Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    AI Analysis
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost & Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.recentActivity.slice(0, 10).map((activity) => (
                  <tr key={activity.applicationId} className="hover:bg-gray-50">
                    {isAllCompaniesView && (
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {activity.companyName}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {activity.candidateName}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900">{activity.jobTitle}</div>
                      <div className="text-xs text-gray-500">{activity.department}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          activity.aiService.includes('gpt-4') ? 'bg-purple-100 text-purple-800' :
                          activity.aiService.includes('gpt-3.5') ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {activity.aiService}
                        </span>
                        <span className="text-xs text-gray-500">
                          {activity.aiModel}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {activity.tokensUsed.toLocaleString()} tokens
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-900">
                          ${activity.estimatedCost.toFixed(3)}
                        </div>
                        <div className="flex items-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            activity.score >= 80 ? 'bg-green-100 text-green-800' :
                            activity.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {activity.score}%
                          </span>
                          {activity.growthPotential && (
                            <span className="ml-2 text-xs text-gray-500">
                              📈 {activity.growthPotential}/5
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(activity.reviewDate).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(activity.reviewDate).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Stats */}
      <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3">
            <div className="text-sm text-gray-500 mb-1">Data Updated</div>
            <div className="text-sm font-medium text-gray-900">
              {new Date(data.metadata.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
          <div className="text-center p-3">
            <div className="text-sm text-gray-500 mb-1">View Period</div>
            <div className="text-sm font-medium text-gray-900 capitalize">{data.metadata.period}</div>
          </div>
          <div className="text-center p-3">
            <div className="text-sm text-gray-500 mb-1">Total Data Points</div>
            <div className="text-sm font-medium text-gray-900">{data.metadata.dataPoints}</div>
          </div>
          <div className="text-center p-3">
            <div className="text-sm text-gray-500 mb-1">User Role</div>
            <div className="text-sm font-medium text-gray-900">{data.userRole}</div>
          </div>
        </div>
      </div>
    </div>
  )
}