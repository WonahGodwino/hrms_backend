// src/app/api/staff/assign-manager/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * POST /api/staff/assign-manager
 * Assigns multiple staff (or ADMIN/HR) to a manager by updating their managerId
 * Body: { staffIds: string[], managerId: string }
 * Only ADMIN, HR, or SUPER_ADMIN can assign
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const body = await request.json()
    const { staffIds, managerId } = body

    if (!Array.isArray(staffIds) || staffIds.length === 0 || !managerId) {
      return withCors(
        ApiResponse.error('staffIds (array) and managerId are required', 400),
        origin
      )
    }

    // Update all selected staff to have the new managerId
    const result = await prisma.staffRecord.updateMany({
      where: {
        id: { in: staffIds }
      },
      data: {
        managerId: managerId
      }
    })

    return withCors(
      ApiResponse.success({
        updatedCount: result.count,
        message: `Assigned ${result.count} staff to manager.`
      }),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
