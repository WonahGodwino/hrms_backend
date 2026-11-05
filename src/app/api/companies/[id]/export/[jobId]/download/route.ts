// src/app/api/companies/[id]/export/[jobId]/download/route.ts
//
// Downloads a completed Company Export job's generated .xlsx file.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'
import fs from 'fs/promises'
import { attachmentDisposition } from '@/app/lib/excel/sheet-theme'
import path from 'path'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string; jobId: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const hasAccess = await validateCompanyAccess(user, params.id)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const job = await prisma.companyExportJob.findFirst({ where: { id: params.jobId, companyId: params.id } })
    if (!job) {
      return withCors(ApiResponse.error('Export job not found', 404), origin)
    }
    if (job.status !== 'COMPLETED' || !job.filePath) {
      return withCors(ApiResponse.error(`This export is not ready to download (status: ${job.status}).`, 409), origin)
    }

    const fullPath = path.isAbsolute(job.filePath) ? job.filePath : path.join(process.cwd(), job.filePath)

    let fileBuffer: Buffer
    try {
      fileBuffer = await fs.readFile(fullPath)
    } catch {
      return withCors(ApiResponse.error('The export file is no longer available on the server.', 404), origin)
    }

    const response = new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(job.fileName || 'Company Data.xlsx'),
        'Cache-Control': 'no-cache'
      }
    })
    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
