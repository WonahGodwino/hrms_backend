/**
 * Staff API Routes for Payroll Engine
 * GET /api/engine/staff - List staff with salary structure status
 * POST /api/engine/staff - Create a new staff record
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as staffService from '@/app/lib/payroll-engine/staff'

// Validation schema for creating staff
const createStaffSchema = z.object({
  staffId: z.string().min(1, 'Staff ID is required'),
  email: z.string().email('Invalid email format').max(254),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  department: z.string().min(1, 'Department is required').max(100),
  position: z.string().min(1, 'Position is required').max(100),
  phone: z.string().optional(),
  bankName: z.string().max(100).optional(),
  accountNumber: z.string().regex(/^\d{8,20}$/, 'Account number must be 8-20 digits').optional().or(z.literal('')),
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits').optional().or(z.literal('')),
})

// Query schema for listing staff
const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  search: z.string().optional(),
  department: z.string().optional(),
  includeInactive: z.coerce.boolean().default(false),
})

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - List staff with salary structure status
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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

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
      search: searchParams.get('search') ?? undefined,
      department: searchParams.get('department') ?? undefined,
      includeInactive: searchParams.get('includeInactive') ?? undefined,
    })

    const result = await staffService.getStaffList(user.companyId, query)

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
    console.error('Get staff list error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch staff list' },
        { status: 500 }
      ),
      origin
    )
  }
}

// POST - Create a new staff record
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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

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

    // Clean empty strings for optional regex fields
    if (body.accountNumber === '') delete body.accountNumber
    if (body.bvn === '') delete body.bvn

    const validation = createStaffSchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    const staff = await staffService.createStaff(
      validation.data,
      user.companyId,
      user.userId
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Staff created successfully',
        data: staff,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Create staff error:', error?.message || String(error))

    // Check for duplicate errors
    if (error.message.includes('already exists')) {
      return withCors(
        NextResponse.json(
          { success: false, message: error.message },
          { status: 409 }
        ),
        origin
      )
    }

    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to create staff' },
        { status: 500 }
      ),
      origin
    )
  }
}
