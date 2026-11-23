// src/app/api/staff/compensation/upload/history/[id]/download/route.ts
//
// Re-downloads the original file from a past Staff Compensation Upload —
// so HR can reuse (as-is, or lightly edited) a sheet they already built
// instead of starting from scratch for a later rollout.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import path from 'path'
import { readUploadFile } from '@/app/lib/storage/upload-files'
import { attachmentDisposition } from '@/app/lib/excel/sheet-theme'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const uploadRecord = await prisma.staffCompensationUpload.findUnique({ where: { id: params.id } })
    if (!uploadRecord) {
      return withCors(ApiResponse.error('Upload not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, uploadRecord.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const fullPath = path.isAbsolute(uploadRecord.filePath) ? uploadRecord.filePath : path.join(process.cwd(), uploadRecord.filePath)

    const bytes = await readUploadFile(uploadRecord.filePath, fullPath)
    if (!bytes) {
      return withCors(ApiResponse.error('The original file is no longer available on the server.', 404), origin)
    }
    const fileBuffer = Buffer.from(bytes)

    const response = new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(uploadRecord.fileName),
        'Cache-Control': 'no-cache'
      }
    })
    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
