// src/app/api/staff-loans-benefits/access-config/route.ts
// GET — list the department/designation allow-list configured for each of
// the five governed admin pages (Financial Dashboard, Loan Management, Loan
// Policy Config, Benefit Policy Config, Benefit Allocation), for the Access
// Configuration screen. Pages with no row yet are returned with empty lists
// (meaning: SUPER_ADMIN-only until configured).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { PAGE_KEYS, PAGE_KEY_LABELS } from '@/app/lib/staff-loans-benefits/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) return withCors(ApiResponse.success({ pages: [] }), origin)

    const rows = await prisma.loansBenefitsPageAccess.findMany({ where: { companyId: user.companyId } })
    const byKey = new Map(rows.map((r) => [r.pageKey, r]))

    const pages = PAGE_KEYS.map((pageKey) => {
      const row = byKey.get(pageKey)
      return {
        pageKey,
        label: PAGE_KEY_LABELS[pageKey],
        departmentIds: (row?.departmentIds as string[]) || [],
        designationIds: (row?.designationIds as string[]) || [],
        configured: !!row,
        updatedAt: row?.updatedAt || null,
      }
    })

    return withCors(ApiResponse.success({ pages }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
