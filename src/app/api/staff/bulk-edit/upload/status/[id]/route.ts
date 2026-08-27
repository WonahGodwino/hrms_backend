// src/app/api/staff/bulk-edit/upload/status/[id]/route.ts
//
// GET — polling target for an async staff bulk-edit upload. Returns the
// current status, and once COMPLETED/FAILED, the same summary shape the
// upload endpoint used to return synchronously.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { id } = await params

    const upload = await prisma.staffUpload.findUnique({ where: { id } })
    if (!upload) {
      return withCors(ApiResponse.error('Upload not found', 404), origin)
    }

    if (authUser.role === 'HR') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId: upload.companyId, role: { in: ['HR', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have HR access for this company', 403), origin)
      }
    } else if (authUser.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId: upload.companyId, role: { in: ['ADMIN', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
      }
    }

    if (upload.status === 'PENDING' || upload.status === 'PROCESSING') {
      return withCors(
        ApiResponse.success({ uploadId: upload.id, status: upload.status }, 'Staff bulk-edit upload is still processing'),
        origin
      )
    }

    if (upload.status === 'FAILED') {
      return withCors(
        ApiResponse.success(
          { uploadId: upload.id, status: 'FAILED', failureReason: upload.failureReason },
          'Staff bulk-edit upload failed'
        ),
        origin
      )
    }

    // Stored as "Row N: message" strings (see processStaffBulkEditInBackground);
    // parse back into the {row, message} shape the upload UI already renders.
    const errors = (upload.errors || []).map((entry) => {
      const match = entry.match(/^Row (\d+): ([\s\S]*)$/)
      return match ? { row: Number(match[1]), message: match[2] } : { row: null, message: entry }
    })

    return withCors(
      ApiResponse.success(
        {
          uploadId: upload.id,
          status: 'COMPLETED',
          summary: {
            totalRecords: upload.totalRecords,
            successful: upload.successful,
            failed: upload.failed,
          },
          errors,
        },
        'Staff bulk-edit processing completed'
      ),
      origin
    )
  } catch (error) {
    console.error('[STAFF_BULK_EDIT_STATUS] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
