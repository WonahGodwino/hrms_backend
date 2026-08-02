import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseStaffCsv } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/staff/preview
// Parses the uploaded file and returns a preview of what will be uploaded.
// Does NOT save anything to the database.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const formData = await req.formData()
    const file     = formData.get('file') as File | null

    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    const ext = file.name.split('.').pop()?.toLowerCase() || 'csv'
    if (!['csv', 'xlsx', 'xls'].includes(ext))
      return withCors(ApiResponse.error('Only CSV or Excel files are supported', 400), origin)

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors, errorRows } = await parseStaffCsv(buffer, ext)

    // Build a safe preview — only show key identifying columns, not all 50+
    const keyColumns = ['staffId', 'firstName', 'lastName', 'email', 'category', 'department', 'jobTitle']
    const previewRows = rows.slice(0, 100).map(r => {
      const preview: Record<string, string> = {}
      for (const col of keyColumns) {
        preview[col] = (r as any)[col] || ''
      }
      return preview
    })

    // Count rows that were skipped as blank
    const blankSkipped = errorRows.length === 0 && rows.length === 0 ? 'all' : 0

    return withCors(ApiResponse.success({
      totalRows: rows.length,
      previewRows,
      parseErrors: errors,
      errorRows: errorRows.map(er => ({ rowNum: er.rowNum, error: er.error })),
      blankSkipped,
      columns: keyColumns,
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
