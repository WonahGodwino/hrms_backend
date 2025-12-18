// src/app/api/payroll/download-original/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import fs from 'fs/promises'
import path from 'path'

type RouteParams = {
  params: {
    id: string
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    const { id } = params

    // Get upload record
    const upload = await prisma.payrollUpload.findUnique({
      where: { id },
    })

    if (!upload) {
      return withCors(
        ApiResponse.error('Upload record not found', 404),
        origin
      )
    }

    // Check permissions
    if (user.role === 'HR' && upload.companyId !== user.companyId) {
      return withCors(
        ApiResponse.error('Unauthorized access to this upload', 403),
        origin
      )
    }

    // Convert relative path to absolute
    const absolutePath = path.join(process.cwd(), upload.filePath)

    // Check if file exists
    try {
      await fs.access(absolutePath)
    } catch {
      return withCors(
        ApiResponse.error('Original file not found on server', 404),
        origin
      )
    }

    // Read file
    const fileBuffer = await fs.readFile(absolutePath)
    const fileName = upload.fileName

    // Create response
    const response = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    console.error('Error downloading original file:', error)
    return withCors(
      ApiResponse.error('Failed to download original file', 500),
      origin
    )
  }
}