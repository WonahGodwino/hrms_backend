// GET /api/exports/{id}/file: download a file prepared in the background (PERF-003).
// Only the person who asked for the file can download it; anyone else gets 404.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/auth'
import { getCorsHeaders, handleCorsOptions, withCors } from '@/app/lib/cors'
import { contentDisposition } from '@/app/lib/exports/http'
import { readExportFile, readExportRecord } from '@/app/lib/exports/store'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const user = requireAuth(request.headers.get('authorization')?.replace('Bearer ', '') ?? null)
    const { id } = await props.params
    const record = await readExportRecord(id)
    if (!record || record.userId !== user.userId) return withCors(ApiResponse.notFound('Export not found or expired'), origin)
    if (record.status !== 'ready') return withCors(ApiResponse.error('The file is not ready yet', 409), origin)
    const file = await readExportFile(id)
    if (!file) return withCors(ApiResponse.notFound('Export not found or expired'), origin)
    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': record.contentType || 'application/octet-stream',
        'Content-Disposition': contentDisposition(record.fileName || 'report'),
        'Content-Length': String(file.length),
        'Cache-Control': 'private, no-store',
        ...getCorsHeaders(origin),
      },
    })
  } catch (error) {
    return withCors(handleApiError(error, request), origin)
  }
}
