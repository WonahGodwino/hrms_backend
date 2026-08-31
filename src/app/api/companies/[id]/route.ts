// src/app/api/companies/[id]/route.ts
// Company profile: GET the full profile and PATCH editable fields.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const PROFILE_SELECT = {
  id: true,
  companyName: true,
  tradingName: true,
  rcNumber: true,
  industry: true,
  website: true,
  biography: true,
  fiscalYearStart: true,
  leaveYearStart: true,
  status: true,
  address: true,
  phone: true,
  email: true,
  logo: true,
  taxId: true,
  baseCurrency: true,
  standardStartTime: true,
  lateGraceMinutes: true,
  createdAt: true,
  updatedAt: true,
} as const

const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

// SUPER_ADMIN → any company; ADMIN → companies they are assigned to; HR → their
// own company (read-only via GET).
async function canManage(user: any, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  if (user.role === 'ADMIN') {
    const uc = await prisma.userCompany.findFirst({
      where: { userId: user.userId, companyId, role: { in: ['ADMIN', 'ALL'] } },
      select: { id: true },
    })
    return !!uc
  }
  return false
}

function extractToken(request: NextRequest): string | null {
  return request.headers.get('authorization')?.replace('Bearer ', '') ?? null
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = extractToken(request)
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { id } = params

    const allowed = (await canManage(user, id)) || (user.role === 'HR' && user.companyId === id)
    if (!allowed) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const company = await prisma.company.findFirst({ where: { id, archived: 0 }, select: PROFILE_SELECT })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    return withCors(ApiResponse.success(company, 'Company profile fetched successfully'), origin)
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = extractToken(request)
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const { id } = params

    const isFullProfileManager = await canManage(user, id)
    const isHrForOwnCompany = user.role === 'HR' && user.companyId === id
    if (!isFullProfileManager && !isHrForOwnCompany) {
      return withCors(ApiResponse.error('You do not have permission to edit this company', 403), origin)
    }

    const existing = await prisma.company.findFirst({ where: { id, archived: 0 }, select: { id: true } })
    if (!existing) return withCors(ApiResponse.error('Company not found', 404), origin)

    const body = await request.json().catch(() => ({}))

    // Required text fields must not be blanked; the rest may be cleared to null.
    const required = new Set(['companyName', 'email'])
    // HR (own company only) may only touch the Leave module's lateness rule —
    // not the rest of the company profile, which stays SUPER_ADMIN/ADMIN-only.
    const editable = isFullProfileManager
      ? ['companyName', 'tradingName', 'rcNumber', 'industry', 'website', 'biography', 'fiscalYearStart', 'leaveYearStart', 'address', 'phone', 'email', 'logo', 'taxId']
      : []

    const data: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of editable) {
      if (body[field] === undefined) continue
      const value = body[field] === null ? '' : String(body[field]).trim()
      if (required.has(field)) {
        if (!value) return withCors(ApiResponse.error(`${field} cannot be empty`, 400), origin)
        data[field] = value
      } else {
        data[field] = value || null
      }
    }

    if (body.standardStartTime !== undefined) {
      if (body.standardStartTime === null || body.standardStartTime === '') {
        data.standardStartTime = null
      } else if (typeof body.standardStartTime === 'string' && START_TIME_PATTERN.test(body.standardStartTime)) {
        data.standardStartTime = body.standardStartTime
      } else {
        return withCors(ApiResponse.error('standardStartTime must be in HH:mm 24-hour format', 400), origin)
      }
    }

    if (body.lateGraceMinutes !== undefined) {
      if (body.lateGraceMinutes === null) {
        data.lateGraceMinutes = null
      } else {
        const minutes = Number(body.lateGraceMinutes)
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 180) {
          return withCors(ApiResponse.error('lateGraceMinutes must be an integer between 0 and 180', 400), origin)
        }
        data.lateGraceMinutes = minutes
      }
    }

    if (body.status !== undefined && isFullProfileManager) {
      const allowedStatuses = ['Active', 'Inactive', 'Pending']
      if (!allowedStatuses.includes(body.status)) {
        return withCors(
          ApiResponse.error(`status must be one of: ${allowedStatuses.join(', ')}`, 400),
          origin,
        )
      }
      data.status = body.status
    }

    if (Object.keys(data).length === 1) {
      return withCors(ApiResponse.error('No editable fields were provided', 400), origin)
    }

    const updated = await prisma.company.update({ where: { id }, data, select: PROFILE_SELECT })
    return withCors(ApiResponse.success(updated, 'Company profile updated successfully'), origin)
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
