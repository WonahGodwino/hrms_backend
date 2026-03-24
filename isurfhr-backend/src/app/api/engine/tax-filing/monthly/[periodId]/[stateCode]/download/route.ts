// src/app/api/engine/tax-filing/monthly/[periodId]/[stateCode]/download/route.ts
// Download State Schedule (Excel or CSV)

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  generateStateSchedule,
  ExportFormat,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/monthly/[periodId]/[stateCode]/download
 * Download the state schedule file
 *
 * Query params:
 * - format: 'xlsx' (default) or 'csv'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string; stateCode: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { periodId, stateCode } = await params
    const { searchParams } = new URL(request.url)
    let companyId = searchParams.get('companyId')
    const format = (searchParams.get('format') || 'xlsx') as ExportFormat

    // Validate format
    if (!['xlsx', 'csv'].includes(format)) {
      return withCors(
        ApiResponse.error('Invalid format. Use xlsx or csv', 400),
        origin
      )
    }

    if (authUser.role === 'HR') {
      companyId = authUser.companyId || null
    } else if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required for administrators', 400),
        origin
      )
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Verify period belongs to company
    const period = await prisma.payPeriod.findUnique({
      where: { id: periodId },
    })

    if (!period || period.companyId !== companyId) {
      return withCors(ApiResponse.error('Pay period not found', 404), origin)
    }

    // Generate the file
    const buffer = await generateStateSchedule(
      companyId,
      periodId,
      stateCode.toUpperCase(),
      format
    )

    // Determine content type and filename
    const contentType = format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    const extension = format === 'csv' ? 'csv' : 'xlsx'
    const filename = `PAYE-Schedule-${stateCode.toUpperCase()}-${period.periodName.replace(/\s+/g, '-')}.${extension}`

    const response = new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(response, origin)
  } catch (error: any) {
    if (error.message?.includes('No employees found')) {
      return withCors(ApiResponse.error(error.message, 404), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
