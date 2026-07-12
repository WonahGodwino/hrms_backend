// GET /api/staff/onboarding-documents/:id/download
// Streams an onboarding document. Staff can download their own; HR/ADMIN/
// SUPER_ADMIN can download any within their company (to verify).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const doc = await (prisma as any).staffOnboardingDocument.findUnique({ where: { id } })
    if (!doc) return withCors(ApiResponse.error('Document not found', 404), origin)

    // Access control.
    if (user.role === 'STAFF') {
      const own = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { id: true } })
      if (!own || own.id !== doc.staffId) return withCors(ApiResponse.error('Forbidden', 403), origin)
    } else if (user.role !== 'SUPER_ADMIN' && user.companyId && doc.companyId !== user.companyId) {
      return withCors(ApiResponse.error('Forbidden', 403), origin)
    }

    const res = new NextResponse(new Uint8Array(doc.data), {
      status: 200,
      headers: {
        'Content-Type': doc.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${doc.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
    const corsRes = withCors(res, origin)
    corsRes.headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type')
    return corsRes
  } catch (error) { return withCors(handleApiError(error), origin) }
}
