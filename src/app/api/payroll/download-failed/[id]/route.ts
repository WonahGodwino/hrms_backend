// src/app/api/payroll/download-failed/[id]/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')

  try {
    // 1) Auth header & role
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    // 2) Extract uploadId from dynamic route
    const uploadId = params.id

    if (!uploadId) {
      return withCors(
        ApiResponse.error('Upload ID is required', 400),
        origin
      )
    }

    console.log(`Download request for upload ID: ${uploadId}`)

    // 3) Find the upload record
    const uploadRecord = await prisma.payrollUpload.findUnique({
      where: { id: uploadId },
    })

    if (!uploadRecord) {
      return withCors(
        ApiResponse.error('Upload record not found', 404),
        origin
      )
    }

    // 4) Multi-company scoping
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('No company assigned for this user', 400),
          origin
        )
      }

      if (uploadRecord.companyId !== user.companyId) {
        return withCors(
          ApiResponse.error(
            'You are not authorized to download failed records for this upload',
            403
          ),
          origin
        )
      }
    }

    if (!uploadRecord.processedFilePath) {
      return withCors(
        ApiResponse.error(
          'No failed records file available for this upload',
          404
        ),
        origin
      )
    }

    // 5) Check if the file exists on disk
    try {
      await stat(uploadRecord.processedFilePath)
      console.log(`File found at: ${uploadRecord.processedFilePath}`)
    } catch (error) {
      console.error('File not found:', error)
      return withCors(
        ApiResponse.error(
          'Failed records file not found on server',
          404
        ),
        origin
      )
    }

    // 6) Stream the file to the client
    const fileStream = createReadStream(uploadRecord.processedFilePath)
    const fileName = `failed-records-${uploadRecord.fileName || uploadRecord.id}.xlsx`

    console.log(`Streaming file: ${fileName}`)

    const fileResponse = new Response(fileStream as any, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })

    return withCors(fileResponse, origin)
  } catch (error) {
    console.error('Failed records download error:', error)
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
