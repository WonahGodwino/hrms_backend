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

    // Define headers for the template
    sheet.addRow(['title', 'description', 'department', 'position', 'expirationDate', 'status'])

    // Optionally, you can add a sample row for guidance or comments
    // Add sample row with default values
    sheet.addRow([
      'Software Engineer', 
      'Develop and maintain software applications.', 
      'Engineering', 
      'Full-time', 
      '', 
      'ACTIVE'
    ])

    // Generate buffer for the file
    const buffer = await workbook.xlsx.writeBuffer()

    // 2. Create a NextResponse with the appropriate headers
    const excelResponse = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="jobs_template.xlsx"',
      },
    })

    // 3. Wrap the response with CORS
    return withCors(excelResponse, origin)
  } catch (error) {
    const message = formatError(error)
    return withCors(
      ApiResponse.error(message || 'Error generating template', 500),
      origin
    )
  }
}
