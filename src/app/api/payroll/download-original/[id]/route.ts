// src/app/api/payroll/download-original/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readFile } from 'fs/promises'
import path from 'path'

// Define a custom error type
interface SystemError extends Error {
  code?: string
}

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const uploadId = params.id

    // Get the upload record
    const uploadRecord = await prisma.payrollUpload.findUnique({
      where: { id: uploadId },
      include: {
        company: {
          select: {
            id: true,
            companyName: true,
          }
        }
      }
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

    // Check if file exists
    if (!uploadRecord.filePath) {
      return withCors(
        ApiResponse.error('Original file not found', 404),
        origin
      )
    }

    // Construct absolute path
    const projectRoot = process.cwd()
    const absolutePath = path.isAbsolute(uploadRecord.filePath) 
      ? uploadRecord.filePath 
      : path.join(projectRoot, uploadRecord.filePath)

    // Read the file
    const fileBuffer = await readFile(absolutePath)
    
    // Determine content type based on file extension
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
    console.error('Error downloading original file:', error)
    
    // Type guard to check if error has a code property
    const systemError = error as SystemError
    
    if (systemError.code === 'ENOENT') {
      return withCors(
        ApiResponse.error('File not found on server', 404),
        origin
      )
    }

    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}