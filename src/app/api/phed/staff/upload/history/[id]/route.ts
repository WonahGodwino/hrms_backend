import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/staff/upload/history/[id]?format=csv
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const upload = await (prisma as any).phedBulkUpload.findUnique({
      where: { id: params.id },
    })

    if (!upload) return withCors(ApiResponse.notFound('Upload not found'), origin)

    const format = new URL(req.url).searchParams.get('format')

    // Return as downloadable CSV
    if (format === 'csv') {
      const errors: string[] = Array.isArray(upload.errors) ? upload.errors : []
      const csv = `Row,Error\n${errors.map((e: string) => {
        const match = e.match(/^Row (\d+):?\s*(.*)$/)
        const row = match ? match[1] : ''
        const msg = match ? match[2].replace(/"/g, '""') : e.replace(/"/g, '""')
        return `${row},"${msg}"`
      }).join('\n')}`

      const safeName = upload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="upload-errors-${safeName}"`,
          'Access-Control-Allow-Origin': origin || '*',
        },
      })
    }

    // Return as JSON
    return withCors(ApiResponse.success({
      id: upload.id,
      fileName: upload.fileName,
      totalRecords: upload.totalRecords,
      successful: upload.successful,
      failed: upload.failed,
      errors: upload.errors || [],
      createdAt: upload.createdAt,
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
