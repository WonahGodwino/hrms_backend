// src/app/api/payslips/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'STAFF'])

    const { id } = params

    // SUPER_ADMIN can see across companies, others are scoped to their company
    const whereClause: any = { id }

    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for this user', 400),
          origin
        )
      }
      whereClause.companyId = user.companyId as string
    }

    const payslip = await prisma.payslip.findFirst({
      where: whereClause,
      include: {
        staffRecord: true,
      },
    })

    if (!payslip) {
      return withCors(
        ApiResponse.error('Payslip not found', 404),
        origin
      )
    }

    // STAFF can only download their own payslips
    if (user.role === 'STAFF' && payslip.staffRecordId !== user.userId) {
      return withCors(
        ApiResponse.error('Forbidden', 403),
        origin
      )
    }

    // Handle different file path formats
    let filePath: string
    
    if (payslip.filePath.startsWith('/uploads/')) {
      // Uploads directory (for generated files)
      filePath = path.join(process.cwd(), payslip.filePath)
    } else if (payslip.filePath.startsWith('/')) {
      // Public directory (stored in public folder)
      filePath = path.join(process.cwd(), 'public', payslip.filePath.slice(1))
    } else if (payslip.filePath.startsWith('uploads/')) {
      // Relative uploads path
      filePath = path.join(process.cwd(), payslip.filePath)
    } else {
      // Assume it's in public directory
      filePath = path.join(process.cwd(), 'public', payslip.filePath)
    }

    console.log(`Looking for payslip file at: ${filePath}`)

    // Try primary location first
    let fileBuffer: Buffer | null = null
    
    try {
      fileBuffer = await fs.readFile(filePath)
    } catch (error) {
      console.error(`Primary file not found: ${filePath}`, error)
    }

    // If primary location fails, try alternative locations
    if (!fileBuffer) {
      const alternativePaths = [
        path.join(process.cwd(), 'public', 'uploads', payslip.fileName),
        path.join(process.cwd(), 'uploads', payslip.fileName),
        path.join(process.cwd(), payslip.filePath),
      ]
      
      for (const altPath of alternativePaths) {
        try {
          fileBuffer = await fs.readFile(altPath)
          console.log(`Found file at alternative path: ${altPath}`)
          break
        } catch {
          continue
        }
      }
    }

    // If still no file found, return error
    if (!fileBuffer) {
      return withCors(
        ApiResponse.error('Payslip file not found on server', 404),
        origin
      )
    }

    // Determine content type based on file extension
    const extension = path.extname(payslip.fileName).toLowerCase()
    let contentType = 'application/octet-stream'
    
    if (extension === '.pdf') contentType = 'application/pdf'
    else if (extension === '.xlsx' || extension === '.xls') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else if (extension === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    else if (extension === '.doc') contentType = 'application/msword'

    const uint8Array = new Uint8Array(fileBuffer)
    const blob = new Blob([uint8Array], { type: contentType })

    const response = new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(payslip.fileName)}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    const message = formatError(error)
    console.error('Error downloading payslip:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}