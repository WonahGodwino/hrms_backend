// src/app/api/payslips/[id]/download/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
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
    // HR, SUPER_ADMIN, STAFF can hit this route
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

    // Resolve file path (stored as `/payslips/...` from generatePayslipPdf)
    const relativePath = payslip.filePath.startsWith('/')
      ? payslip.filePath.slice(1)
      : payslip.filePath

    const filePath = path.join(process.cwd(), 'public', relativePath)

    let fileBuffer: Buffer
    try {
      fileBuffer = await fs.readFile(filePath)
    } catch {
      return withCors(
        ApiResponse.error('Payslip file missing on server', 500),
        origin
      )
    }

    const uint8Array = new Uint8Array(fileBuffer)
    const blob = new Blob([uint8Array], { type: 'application/pdf' })

    return new Response(blob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${payslip.fileName}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
