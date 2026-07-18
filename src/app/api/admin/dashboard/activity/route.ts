// src/app/api/admin/dashboard/activity/route.ts
// GET /api/admin/dashboard/activity — recent cross-module activity feed
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10')))

    // Resolve accessible companies
    let companyIds: string[] = []
    const queryCompanyId = searchParams.get('companyId')

    if (user.role === 'SUPER_ADMIN') {
      const companies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true },
      })
      companyIds = companies.map(c => c.id)
    } else {
      const userCompanies = await prisma.userCompany.findMany({
        where: { userId: user.userId, company: { archived: 0 } },
        select: { companyId: true },
      })
      companyIds = userCompanies.map(uc => uc.companyId)
    }

    // If a specific company is selected, filter to that one
    if (queryCompanyId && companyIds.includes(queryCompanyId)) {
      companyIds = [queryCompanyId]
    }

    if (companyIds.length === 0) {
      return withCors(ApiResponse.success({ activities: [] }, 'No companies available'), origin)
    }

    // Query domain-specific audit/activity tables in parallel
    const [
      buLogs,
      deptLogs,
      trainingLogs,
      emailLogs,
    ] = await Promise.all([
      // Business Unit audit logs
      prisma.businessUnitAuditLog.findMany({
        where: { companyId: { in: companyIds } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, action: true, performedByName: true, details: true, createdAt: true },
      }) as any,
      // Department audit logs
      prisma.departmentAuditLog.findMany({
        where: { companyId: { in: companyIds } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: { id: true, action: true, userName: true, details: true, timestamp: true },
      }) as any,
      // Training audit logs
      prisma.trainingAuditLog.findMany({
        where: { companyId: { in: companyIds } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, action: true, actorId: true, entityType: true, metadata: true, createdAt: true },
      }) as any,
      // Email logs
      prisma.emailLog.findMany({
        where: { companyId: { in: companyIds } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, recipient: true, emailType: true, status: true, createdAt: true },
      }) as any,
    ])

    // Normalize into a uniform activity format
    const activities: Array<{
      id: string
      name: string
      time: string
      tag: string
      color: string
    }> = []

    // BU logs
    for (const log of buLogs) {
      const actor = log.performedByName || 'System'
      const action = (log.action || 'updated').toLowerCase()
      activities.push({
        id: `bu-${log.id}`,
        name: `${actor} ${action} a business unit`,
        time: formatRelativeTime(log.createdAt),
        tag: 'Business Unit',
        color: 'blue',
      })
    }

    // Department logs
    for (const log of deptLogs) {
      const actor = log.userName || 'System'
      const action = (log.action || 'updated').toLowerCase()
      activities.push({
        id: `dept-${log.id}`,
        name: `${actor} ${action} a department`,
        time: formatRelativeTime(log.timestamp),
        tag: 'Department',
        color: 'indigo',
      })
    }

    // Training logs
    for (const log of trainingLogs) {
      const action = (log.action || '').replace(/_/g, ' ').toLowerCase()
      const entity = (log.entityType || 'record').replace(/_/g, ' ')
      activities.push({
        id: `tr-${log.id}`,
        name: `${action}: ${entity}`,
        time: formatRelativeTime(log.createdAt),
        tag: 'Training',
        color: 'purple',
      })
    }

    // Email logs
    for (const log of emailLogs) {
      const recipient = (log as any).recipient || 'a recipient'
      const emailType = (log as any).emailType || 'email'
      activities.push({
        id: `em-${log.id}`,
        name: `${(log as any).status === 'SENT' ? 'Sent' : 'Attempted'} "${emailType}" to ${recipient}`,
        time: formatRelativeTime((log as any).createdAt),
        tag: 'Email',
        color: 'green',
      })
    }

    // Sort by time (most recent first) and limit
    activities.sort((a, b) => {
      const parseTime = (t: string) => {
        if (t === 'Just now') return Date.now()
        const match = t.match(/(\d+)\s*(min|hour|day)s?\s*ago/)
        if (match) return Date.now() - parseInt(match[1]) * (match[2] === 'day' ? 86400000 : match[2] === 'hour' ? 3600000 : 60000)
        return 0
      }
      return parseTime(b.time) - parseTime(a.time)
    })

    return withCors(
      ApiResponse.success({ activities: activities.slice(0, limit) }, 'Recent activity fetched'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'Just now'
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
  if (diff < 172800000) return 'Yesterday'
  return `${Math.floor(diff / 86400000)} days ago`
}
