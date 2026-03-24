/**
 * Employee Salaries API Routes
 * POST /api/engine/employee-salaries - Create a salary structure
 * GET /api/engine/employee-salaries - Get all salary structures
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as employeeSalaryService from '@/app/lib/payroll-engine/employee-salary'

// Validation schema
const createSalarySchema = z.object({
  staffId: z.string().min(1),
  employeeCategory: z.enum(['REGULAR', 'CONTRACT']).optional(),
  basicSalary: z.number().positive(),
  housingAllowance: z.number().min(0).optional(),
  transportAllowance: z.number().min(0).optional(),
  dressingAllowance: z.number().min(0).optional(),
  leaveAllowance: z.number().min(0).optional(),
  entertainmentAllowance: z.number().min(0).optional(),
  utilityAllowance: z.number().min(0).optional(),
  otherAllowances: z.number().min(0).optional(),
  annualRent: z.number().min(0).optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  pensionFundAdministrator: z.string().optional(),
  pensionPin: z.string().optional(),
  effectiveDate: z.string().optional(),
})

const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
  isActive: z.coerce.boolean().optional(),
  employeeCategory: z.string().optional(),
})

function getErrorStatus(message: string): number {
  if (message.includes('Authentication required') || message.includes('Invalid or expired token')) return 401
  if (message.includes('Insufficient permissions')) return 403
  if (message.includes('not associated with a company') || message.includes('Validation failed')) return 400
  return 500
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
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
    const user = await requireRoleAsync(token, ['SUPER_ADMIN', 'ADMIN'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const body = await request.json()
    const validation = createSalarySchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    const salary = await employeeSalaryService.createSalaryStructure(
      validation.data,
      user.companyId
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Salary structure created successfully',
        data: salary,
      }),
      origin
    )
  } catch (error: any) {
    const message = error?.message || String(error)
    console.error('Create salary structure error:', message)
    return withCors(
      NextResponse.json(
        { success: false, message: message || 'Failed to create salary structure' },
        { status: getErrorStatus(message) }
      ),
      origin
    )
  }
}

export async function GET(request: NextRequest) {
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
    const user = await requireRoleAsync(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const { searchParams } = new URL(request.url)
    const query = querySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      isActive: searchParams.get('isActive') ?? undefined,
      employeeCategory: searchParams.get('employeeCategory') ?? undefined,
    })

    const result = await employeeSalaryService.getAllSalaryStructures(user.companyId, query)

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
    const message = error?.message || String(error)
    console.error('Get salary structures error:', message)
    return withCors(
      NextResponse.json(
        { success: false, message: message || 'Failed to fetch salary structures' },
        { status: getErrorStatus(message) }
      ),
      origin
    )
  }
}
