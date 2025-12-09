// src/app/api/staff/upload/history/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 1) Auth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    // HR & SUPER_ADMIN can view staff upload history
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('No company context for this user', 400),
        origin
      )
    }

    const companyId = user.companyId as string

    // 2) Pagination
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const skip = (page - 1) * limit

    // 3) Fetch uploads + total count (company-scoped)
    const [uploads, totalUploads] = await Promise.all([
      prisma.staffUpload.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          fileName: true,
          createdAt: true,
          uploadedBy: true,   // this should hold StaffRecord.id
          successful: true,
          failed: true,
          totalRecords: true,
        },
      }),
      prisma.staffUpload.count({ where: { companyId } }),
    ])

    // 4) Load uploader StaffRecord details (name + email)
    const uploaderIds = Array.from(
      new Set(
        uploads
          .map((u) => u.uploadedBy)
          .filter((id): id is string => Boolean(id))
      )
    )

    const uploaders = uploaderIds.length
      ? await prisma.staffRecord.findMany({
          where: { id: { in: uploaderIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        })
      : []

    const uploaderMap = new Map(
      uploaders.map((u) => [u.id, u])
    )

    // 5) Shape response DTO for UI
    const rows = uploads.map((upload) => {
      const uploader = uploaderMap.get(upload.uploadedBy || '')

      const fullName = uploader
        ? `${uploader.firstName} ${uploader.lastName}`.trim()
        : 'Unknown Staff'

      const email = uploader?.email || null

      // Short reference like #U-10524 (last 5 chars)
      const shortRef = `#U-${upload.id.slice(-5).toUpperCase()}`

      const totalRecords =
        upload.totalRecords ?? upload.successful + upload.failed

      return {
        uploadId: upload.id,
        reference: shortRef,
        fileName: upload.fileName,
        uploadedOn: upload.createdAt,
        uploaderName: fullName,
        uploaderEmail: email,
        successful: upload.successful,
        failed: upload.failed,
        totalRecords,
      }
    })

    return withCors(
      ApiResponse.success(
        {
          uploads: rows,
          meta: {
            page,
            limit,
            totalUploads,
            totalPages: Math.ceil(totalUploads / limit),
          },
        },
        'Staff upload records fetched successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
