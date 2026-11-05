// src/app/api/staff/upload/validate/route.ts
//
// Dry run for the staff upload drawer: parses the file and reports every problem per row and
// field without writing anything. The import route re-runs the same validator before saving.
import { NextRequest } from 'next/server'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { parseStaffUpload } from '@/app/lib/staff/upload-parser'
import { resolveStaffUploadContext } from '@/app/lib/staff/upload-access'
import { missingRequiredColumns, summarizeValidation, unknownColumns, validateStaffRows } from '@/app/lib/staff/upload-validator'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

const MAX_ISSUE_ROWS = 1000

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const formData = await request.formData()
    const ctx = await resolveStaffUploadContext(request, formData)
    if (!ctx.ok) return withCors(ApiResponse.error(ctx.message, ctx.status), origin)

    const parsed = await parseStaffUpload(ctx.file.name, ctx.file.type, await ctx.file.arrayBuffer())
    if (!parsed.ok) return withCors(ApiResponse.error(parsed.error, 400), origin)

    const missing = missingRequiredColumns(parsed.columns)
    if (missing.length > 0) {
      return withCors(ApiResponse.error(`Missing required columns: ${missing.join(', ')}. Found columns: ${parsed.columns.join(', ')}`, 400), origin)
    }

    const rows = await validateStaffRows(parsed.rows, ctx.companyId)
    const withIssues = rows.filter((r) => r.errors.length > 0 || r.warnings.length > 0)

    return withCors(
      ApiResponse.success(
        {
          fileName: ctx.file.name,
          companyName: ctx.company.companyName,
          summary: summarizeValidation(rows),
          unknownColumns: unknownColumns(parsed.columns),
          issues: withIssues.slice(0, MAX_ISSUE_ROWS).map((r) => ({
            row: r.sheetRow,
            staffId: r.fields.staffId,
            name: `${r.fields.firstName} ${r.fields.lastName}`.trim(),
            errors: r.errors,
            warnings: r.warnings,
          })),
          issuesTruncated: withIssues.length > MAX_ISSUE_ROWS,
        },
        'Validation complete'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
