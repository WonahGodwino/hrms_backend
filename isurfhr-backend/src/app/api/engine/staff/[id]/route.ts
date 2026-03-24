/**
 * Staff Individual API Routes for Payroll Engine
 * GET /api/engine/staff/[id] - Get a single staff record
 * PUT /api/engine/staff/[id] - Update a staff record
 * DELETE /api/engine/staff/[id] - Deactivate a staff record
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as staffService from '@/app/lib/payroll-engine/staff'

// Validation schema for updating staff
const updateStaffSchema = z.object({
  email: z.string().email('Invalid email format').max(254).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(100).optional(),
  position: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  bankName: z.string().max(100).optional(),
  accountNumber: z.string().regex(/^\d{8,20}$/, 'Account number must be 8-20 digits').optional().or(z.literal('')),
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits').optional().or(z.literal('')),
})

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get a single staff record
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params
    const staff = await staffService.getStaffById(id, user.companyId)

    return withCors(
      NextResponse.json({
        success: true,
        data: staff,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get staff error:', error?.message || String(error))

    if (error.message.includes('not found')) {
      return withCors(
        NextResponse.json(
          { success: false, message: error.message },
          { status: 404 }
        ),
        origin
      )
    }

    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch staff' },
        { status: 500 }
      ),
      origin
    )
  }
}

// PUT - Update a staff record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params
    const body = await request.json()

    // Clean empty strings for optional regex fields
    if (body.accountNumber === '') delete body.accountNumber
    if (body.bvn === '') delete body.bvn

    const validation = updateStaffSchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    const staff = await staffService.updateStaff(
      id,
      validation.data,
      user.companyId,
      user.userId
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Staff updated successfully',
        data: staff,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Update staff error:', error?.message || String(error))

    if (error.message.includes('not found')) {
      return withCors(
        NextResponse.json(
          { success: false, message: error.message },
          { status: 404 }
        ),
        origin
      )
    }

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
        { success: false, message: error.message || 'Failed to update staff' },
        { status: 500 }
      ),
      origin
    )
  }
}

// DELETE - Deactivate a staff record (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params
    await staffService.deactivateStaff(id, user.companyId)

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Staff deactivated successfully',
      }),
      origin
    )
  } catch (error: any) {
    console.error('Deactivate staff error:', error?.message || String(error))

    if (error.message.includes('not found')) {
      return withCors(
        NextResponse.json(
          { success: false, message: error.message },
          { status: 404 }
        ),
        origin
      )
    }

    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to deactivate staff' },
        { status: 500 }
      ),
      origin
    )
  }
}
