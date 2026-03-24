/**
 * Deductions by Period API Routes
 * GET /api/engine/deductions/[periodId] - Get deduction entries for a period
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as deductionsService from '@/app/lib/payroll-engine/deductions'

const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
  staffId: z.string().optional(),
  deductionType: z.string().optional(),
  type: z.string().optional(), // For summary
})

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
    const query = querySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      staffId: searchParams.get('staffId') ?? undefined,
      deductionType: searchParams.get('deductionType') ?? undefined,
      type: searchParams.get('type') ?? undefined,
    })

    // If type=summary, return deduction summary
    if (query.type === 'summary') {
      const summary = await deductionsService.getDeductionSummaryByType(periodId, user.companyId)
      return withCors(
        NextResponse.json({
          success: true,
          data: summary,
        }),
        origin
      )
    }

    const result = await deductionsService.getDeductionsByPeriod(periodId, user.companyId, query)

    return withCors(
      NextResponse.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get deduction entries error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch deduction entries' },
        { status: 500 }
      ),
      origin
    )
  }
}
