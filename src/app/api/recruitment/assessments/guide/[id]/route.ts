// GET /api/recruitment/assessments/guide/:id — serve uploaded evaluation guide PDF
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN', 'STAFF'])
    const { id } = await params

    const file = await prisma.candidateFile.findFirst({
      where: { id, type: 'EVALUATION_GUIDE' },
      select: { fileName: true, mimeType: true, data: true },
    })
    if (!file || !file.data) {
      return new NextResponse('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': origin || '*' } })
    }

    return new NextResponse(Buffer.from(file.data as any), {
      headers: {
        'Content-Type': file.mimeType || 'application/pdf',
        'Content-Disposition': `inline; filename="${file.fileName}"`,
        'Access-Control-Allow-Origin': origin || '*',
      },
    })
  } catch {
    return new NextResponse('Internal error', { status: 500, headers: { 'Access-Control-Allow-Origin': origin || '*' } })
  }
}
