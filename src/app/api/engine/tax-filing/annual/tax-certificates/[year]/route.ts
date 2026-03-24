// src/app/api/engine/tax-filing/annual/tax-certificates/[year]/route.ts
// Employee Tax Certificate Generation API

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { generateTaxCertificate } from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/annual/tax-certificates/[year]
 * Generate tax certificate for an employee
 *
 * Query params:
 * - staffId: Required - the staff ID to generate certificate for
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { year } = await params
    const yearNum = parseInt(year, 10)

    if (isNaN(yearNum)) {
      return withCors(ApiResponse.error('Invalid year', 400), origin)
    }

    const { searchParams } = new URL(request.url)
    const staffId = searchParams.get('staffId')
    let companyId = searchParams.get('companyId')

    if (!staffId) {
      return withCors(
        ApiResponse.error('Staff ID is required', 400),
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

    // Verify staff belongs to company
    const staff = await prisma.staffRecord.findUnique({
      where: { id: staffId },
      select: { id: true, companyId: true, firstName: true, lastName: true },
    })

    if (!staff || staff.companyId !== companyId) {
      return withCors(ApiResponse.error('Staff not found', 404), origin)
    }

    // Generate tax certificate
    const buffer = await generateTaxCertificate(staffId, yearNum)

    const filename = `Tax-Certificate-${staff.lastName}-${staff.firstName}-${yearNum}.xlsx`

    const response = new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(response, origin)
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('No payslips')) {
      return withCors(ApiResponse.error(error.message, 404), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}

/**
 * POST /api/engine/tax-filing/annual/tax-certificates/[year]
 * Get list of employees eligible for tax certificates
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { year } = await params
    const yearNum = parseInt(year, 10)

    if (isNaN(yearNum)) {
      return withCors(ApiResponse.error('Invalid year', 400), origin)
    }

    const body = await request.json().catch(() => ({}))
    let companyId = body.companyId as string | null

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

    // Get all pay periods for the year
    const periods = await prisma.payPeriod.findMany({
      where: {
        companyId,
        year: yearNum,
        status: { in: ['REVIEW', 'APPROVED', 'PAID'] },
      },
    })

    if (periods.length === 0) {
      return withCors(
        ApiResponse.error(`No completed pay periods found for ${yearNum}`, 404),
        origin
      )
    }

    // Get employees with payslips for this year
    const employees = await prisma.staffRecord.findMany({
      where: {
        companyId,
        computedPayslips: {
          some: {
            payPeriodId: { in: periods.map(p => p.id) },
            paymentStatus: { in: ['ACTIVE', 'PAID'] },
          },
        },
      },
      select: {
        id: true,
        staffId: true,
        firstName: true,
        lastName: true,
        email: true,
        taxProfile: {
          select: {
            stateOfResidence: true,
            jtbTin: true,
          },
        },
        _count: {
          select: {
            computedPayslips: {
              where: {
                payPeriodId: { in: periods.map(p => p.id) },
                paymentStatus: { in: ['ACTIVE', 'PAID'] },
              },
            },
          },
        },
      },
      orderBy: { lastName: 'asc' },
    })

    const employeeList = employees.map(emp => ({
      id: emp.id,
      staffId: emp.staffId,
      name: `${emp.lastName.toUpperCase()}, ${emp.firstName}`,
      email: emp.email,
      stateOfResidence: emp.taxProfile?.stateOfResidence || null,
      jtbTin: emp.taxProfile?.jtbTin || null,
      payslipsCount: emp._count.computedPayslips,
    }))

    return withCors(
      ApiResponse.success({
        year: yearNum,
        periodsCount: periods.length,
        employees: employeeList,
        totalEmployees: employeeList.length,
      }, `Found ${employeeList.length} employees eligible for tax certificates`),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}