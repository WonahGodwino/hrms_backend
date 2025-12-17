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

    // Fetch payslip with company info
    const payslip = await prisma.payslip.findUnique({
      where: { id },
      include: {
        staffRecord: {
          select: {
            id: true,
            companyId: true,
            firstName: true,
            lastName: true,
          }
        },
      },
    })

    if (!payslip) {
      return withCors(
        ApiResponse.error('Payslip not found', 404),
        origin
      )
    }

    // Permission checks based on role
    switch (user.role) {
      case 'STAFF':
        // STAFF can only download their own payslips
        if (payslip.staffRecordId !== user.userId) {
          return withCors(
            ApiResponse.error('Forbidden: You can only download your own payslips', 403),
            origin
          )
        }
        break

      case 'HR':
        // HR can download any payslip within their company
        if (!user.companyId) {
          return withCors(
            ApiResponse.error('Company context missing for HR user', 400),
            origin
          )
        }
        if (payslip.staffRecord.companyId !== user.companyId) {
          return withCors(
            ApiResponse.error('Forbidden: HR can only download payslips within their company', 403),
            origin
          )
        }
        break

      case 'SUPER_ADMIN':
        // SUPER_ADMIN can download any payslip from any company
        // No additional checks needed
        break

      default:
        return withCors(
          ApiResponse.error('Unauthorized role', 403),
          origin
        )
    }

    // File handling logic (unchanged)
    let filePath: string
    
    if (payslip.filePath.startsWith('/uploads/')) {
      filePath = path.join(process.cwd(), payslip.filePath)
    } else if (payslip.filePath.startsWith('/')) {
      filePath = path.join(process.cwd(), 'public', payslip.filePath.slice(1))
    } else if (payslip.filePath.startsWith('uploads/')) {
      filePath = path.join(process.cwd(), payslip.filePath)
    } else {
      filePath = path.join(process.cwd(), 'public', payslip.filePath)
    }

    console.log(`Looking for payslip file at: ${filePath}`)

    let fileBuffer: Buffer | null = null
    
    try {
      fileBuffer = await fs.readFile(filePath)
    } catch (error) {
      console.error(`Primary file not found: ${filePath}`, error)
    }

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

    if (!fileBuffer) {
      return withCors(
        ApiResponse.error('Payslip file not found on server', 404),
        origin
      )
    }

    const extension = path.extname(payslip.fileName).toLowerCase()
    let contentType = 'application/octet-stream'
    
    if (extension === '.pdf') contentType = 'application/pdf'
    else if (extension === '.xlsx' || extension === '.xls') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else if (extension === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    else if (extension === '.doc') contentType = 'application/msword'

    const uint8Array = new Uint8Array(fileBuffer)
    const blob = new Blob([uint8Array], { type: contentType })

    // Audit log
    console.log(`Payslip ${payslip.id} downloaded by ${user.role}: ${user.email}`)

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