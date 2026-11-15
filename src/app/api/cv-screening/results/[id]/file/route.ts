// src/app/api/cv-screening/results/[id]/file/route.ts
// GET - streams the original uploaded CV blob, mirroring the
// recruitment/applicants/[applicationId]/cv download route's convention.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveCvScreeningCompanyId } from '@/app/lib/cv-screening/companyScope'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_')
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'CV_SCREENING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const scope = await resolveCvScreeningCompanyId(user, searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)

    const disposition = searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'

    const result = await prisma.screeningCvResult.findFirst({
      where: { id, companyId: scope.companyId as string },
      select: { fileName: true, mimeType: true, sizeBytes: true, data: true },
    })

    if (!result) return withCors(ApiResponse.error('CV file not found', 404), origin)

    const filename = sanitizeFilename(result.fileName || 'cv')
    const res = new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': result.mimeType || 'application/octet-stream',
        'Content-Length': String(result.sizeBytes ?? result.data.length),
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })

    return withCors(res, origin)
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
