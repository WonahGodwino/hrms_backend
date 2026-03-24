/**
 * Payroll Reports API Routes
 * GET /api/engine/reports/[periodId]?type=REPORT_TYPE - Get report data
 * GET /api/engine/reports/[periodId]?type=REPORT_TYPE&download=true - Download as Excel
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as payrollReportsService from '@/app/lib/payroll-engine/payroll-reports'

const VALID_REPORT_TYPES = [
  'BANK_SCHEDULE',
  'WITHHELD_SALARIES',
  'PAYE_SCHEDULE',
  'PENSION_SCHEDULE',
  'NHF_SCHEDULE',
  'ITF_SCHEDULE',
  'NSITF_SCHEDULE',
  'COST_CENTRE_SUMMARY',
]

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Authorization header missing' },
          { status: 401 }
        ),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const { periodId } = await params
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('type') ?? undefined
    const download = searchParams.get('download') ?? undefined === 'true'

    if (!reportType || !VALID_REPORT_TYPES.includes(reportType)) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: `Invalid report type. Valid types: ${VALID_REPORT_TYPES.join(', ')}`,
          },
          { status: 400 }
        ),
        origin
      )
    }

    const data = await payrollReportsService.getReportData(periodId, user.companyId, reportType)

    // Handle download as Excel
    if (download) {
      // Handle ITF/NSITF which return objects with schedule property
      const reportData = Array.isArray(data) ? data : data.schedule || [data]

      const buffer = payrollReportsService.exportToExcel(reportData, reportType)

      const response = new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename=${reportType.toLowerCase()}-${periodId}.xlsx`,
        },
      })

      // Add CORS headers
      if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Credentials', 'true')
      }

      return response
    }

    return withCors(
      NextResponse.json({
        success: true,
        reportType,
        data,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get report error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to generate report' },
        { status: 500 }
      ),
      origin
    )
  }
}
