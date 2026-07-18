// GET /api/recruitment/onboarding/documents/:docId/download
// Streams the actual file bytes of a candidate's uploaded document so HR can
// view and review it before approving or rejecting.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { promises as fs } from 'fs'
import * as path from 'path'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { docId } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || ''

    const where: any = { id: docId, archived: 0 }
    if (companyId) where.companyId = companyId

    const doc = await (prisma as any).candidateDocument.findFirst({ where })
    if (!doc) return withCors(ApiResponse.error('Document not found', 404), origin)

    // Documents are stored on disk at the relative path in doc.filePath
    // (e.g. /candidate-docs/{candidateId}/{category}/{filename}).
    // Resolve the full path relative to the public directory.
    const fullPath = path.join(process.cwd(), 'public', doc.filePath.replace(/^\//, ''))
    const buffer = await fs.readFile(fullPath).catch(() => null)
    if (!buffer) return withCors(ApiResponse.error('Document file not found on disk', 404), origin)

    const mime = doc.fileName?.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
    const disposition = `inline; filename="${doc.fileName || 'document'}"`

    return withCors(
      new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=3600',
        },
      }),
      origin,
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}
