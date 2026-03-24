/**
 * Deduction Entry API Routes
 * DELETE /api/engine/deductions/entry/[id] - Delete a deduction entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as deductionsService from '@/app/lib/payroll-engine/deductions'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

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
    requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

    const { id } = await params
    await deductionsService.deleteDeductionEntry(id)

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Deduction entry deleted successfully',
      }),
      origin
    )
  } catch (error: any) {
    console.error('Delete deduction entry error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to delete deduction entry' },
        { status: 500 }
      ),
      origin
    )
  }
}
