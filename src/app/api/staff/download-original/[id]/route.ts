// src/app/api/staff/download-original/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readFile } from 'fs/promises'
import path from 'path'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const user = await requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const uploadId = params.id

    const uploadRecord = await prisma.staffUpload.findUnique({
      where: { id: uploadId },
    })

    if (!uploadRecord) {
      return withCors(
        ApiResponse.error('Upload record not found', 404),
        origin
      )
    }

    // Check permissions
    if (user.role === 'HR' && user.companyId !== uploadRecord.companyId) {
      return withCors(
        ApiResponse.error('You do not have access to this upload record', 403),
        origin
      )
    }

    if (user.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: uploadRecord.companyId,
          role: { in: ['ADMIN', 'ALL'] }
        }
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have access to this upload record', 403),
          origin
        )
      }
    }

    if (!uploadRecord.filePath) {
      return withCors(
        ApiResponse.error('Original file not found', 404),
        origin
      )
    }

    const projectRoot = process.cwd()
    const absolutePath = path.isAbsolute(uploadRecord.filePath)
      ? uploadRecord.filePath
      : path.join(projectRoot, uploadRecord.filePath)

    const fileBuffer = await readFile(absolutePath)

    const fileExt = path.extname(uploadRecord.fileName).toLowerCase()
    let contentType = 'application/octet-stream'

    if (fileExt === '.xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    } else if (fileExt === '.xls') {
      contentType = 'application/vnd.ms-excel'
    } else if (fileExt === '.csv') {
      contentType = 'text/csv'
    }

    const response = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${uploadRecord.fileName}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Length': fileBuffer.length.toString(),
      },
    })

    return withCors(response, origin)

  } catch (error) {
    console.error('Error downloading original staff upload file:', error)

    const err = error as any

    if (err.code === 'ENOENT') {
      return withCors(
        ApiResponse.error('This file was uploaded to a different server instance and is no longer available.', 404),
        origin
      )
    }

    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
