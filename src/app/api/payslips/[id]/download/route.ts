// src/app/api/payslips/[id]/download/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import fs from 'fs/promises'
import path from 'path'

type RouteParams = {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return ApiResponse.error('Authorization header missing', 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'STAFF'])

    if (!user.companyId) {
      return ApiResponse.error('Company context missing for this user', 400)
    }
    const companyId: string = user.companyId as string

    const { id } = params

    const payslip = await prisma.payslip.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        staffRecord: true,
      },
    })

    if (!payslip) {
      return ApiResponse.error('Payslip not found', 404)
    }

    // STAFF can only download their own payslips
    if (user.role === 'STAFF' && payslip.staffRecordId !== user.userId) {
      return ApiResponse.error('Forbidden', 403)
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
      return ApiResponse.error('Payslip file missing on server', 500)
    }

    // Convert Buffer to Uint8Array for proper TypeScript compatibility
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
    return handleApiError(error)
  }
}