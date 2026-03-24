/**
 * Employee Salary by Staff ID API Routes
 * GET /api/engine/employee-salaries/[staffId] - Get salary structure
 * PUT /api/engine/employee-salaries/[staffId] - Update salary structure
 * DELETE /api/engine/employee-salaries/[staffId] - Deactivate salary structure
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as employeeSalaryService from '@/app/lib/payroll-engine/employee-salary'

// Validation schema
const updateSalarySchema = z.object({
  employeeCategory: z.enum(['REGULAR', 'CONTRACT']).optional(),
  basicSalary: z.number().positive().optional(),
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

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const { staffId } = await params
    const salary = await employeeSalaryService.getSalaryStructure(staffId, user.companyId)

    return withCors(
      NextResponse.json({
        success: true,
        data: salary,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get salary structure error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Salary structure not found' },
        { status: 404 }
      ),
      origin
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
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

    const { staffId } = await params
    const body = await request.json()
    const validation = updateSalarySchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    const salary = await employeeSalaryService.updateSalaryStructure(
      staffId,
      validation.data,
      user.companyId
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Salary structure updated successfully',
        data: salary,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Update salary structure error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to update salary structure' },
        { status: 500 }
      ),
      origin
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
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

    const { staffId } = await params
    await employeeSalaryService.deactivateSalaryStructure(staffId, user.companyId)

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Salary structure deactivated successfully',
      }),
      origin
    )
  } catch (error: any) {
    console.error('Deactivate salary structure error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to deactivate salary structure' },
        { status: 500 }
      ),
      origin
    )
  }
}
