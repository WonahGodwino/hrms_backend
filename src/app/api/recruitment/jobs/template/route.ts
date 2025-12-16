// src/app/api/jobs/template/route.ts
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 1. Build workbook in memory
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Jobs Template')

    // Example headers – adjust to match your upload logic
    sheet.addRow(['title', 'description', 'department', 'position', 'expirationDate'])
    // Optionally, you can add a sample row or comments here

    const buffer = await workbook.xlsx.writeBuffer()

    // 2. Create a NextResponse, not a plain Response
    const excelResponse = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="jobs_template.xlsx"',
      },
    })

    // 3. Wrap with CORS
    return withCors(excelResponse, origin)
  } catch (error) {
    const message = formatError(error)
    return withCors(
      ApiResponse.error(message || 'Error generating template', 500),
      origin
    )
  }
}
