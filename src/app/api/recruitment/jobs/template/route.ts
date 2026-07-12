// src/app/api/recruitment/jobs/template/route.ts
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
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Jobs Template')

    const headers = [
      'designation',
      'title',
      'description',
      'department',
      'employmentType',
      'workplaceType',
      'experienceLevel',
      'salaryRange',
      'locations',
      'expirationDate',
      'status'
    ]

    sheet.addRow(headers)

    // Plain-text example description. Formatting (paragraphs / bullet lists) is
    // applied automatically on import — do NOT put HTML tags in this column.
    const exampleDescription = [
      'We are looking for a Senior Product Designer to lead design across our products.',
      '',
      'Responsibilities:',
      '- Own the end-to-end design process',
      '- Partner with engineering and product teams',
      '- Mentor junior designers',
      '',
      'Requirements:',
      '- 5+ years of product design experience',
      '- A strong portfolio of shipped work',
    ].join('\n')

    const exampleRow = sheet.addRow([
      'Senior Product Designer',
      '',
      exampleDescription,
      'Engineering',
      'Full-time',
      'Hybrid',
      'Senior',
      'N500,000 - N800,000',
      'Lagos:Ikeja,Abuja:Wuse',
      '2026-05-30',
      'ACTIVE'
    ])
    // Wrap the multi-line description cell so it stays readable.
    exampleRow.getCell(3).alignment = { wrapText: true, vertical: 'top' }

    sheet.addRow([])
    sheet.addRow(['INSTRUCTIONS:'])
    sheet.addRow(['- designation: REQUIRED. Must match an existing designation (by title or code) in Core Setup → Designations.'])
    sheet.addRow(['- title: OPTIONAL. Leave blank to use the designation name as the job title.'])
    sheet.addRow(['- department: REQUIRED. Must match an existing department name in Core Setup → Departments.'])
    sheet.addRow(['- description: plain text only. Do NOT use HTML tags.'])
    sheet.addRow(['    • Leave a blank line between paragraphs.'])
    sheet.addRow(['    • Start a line with "-" for a bullet point.'])
    sheet.addRow(['    • Formatting is applied automatically when the file is imported.'])
    sheet.addRow(['- locations: format "State:LGA" separated by commas'])
    sheet.addRow(['- employmentType: Full-time, Part-time, Contract, Internship, Temporary'])
    sheet.addRow(['- workplaceType: On-site, Hybrid, Remote'])
    sheet.addRow(['- experienceLevel: Entry-level, Mid-level, Senior, Lead, Executive'])
    sheet.addRow(['- expirationDate: YYYY-MM-DD format (leave empty for open-ended)'])
    sheet.addRow(['- status: DRAFT, ACTIVE, CLOSED, EXPIRED (default ACTIVE)'])
    sheet.addRow(['- Benefits are NOT set here — after import, link benefits to each designation/job in the Loans & Benefits module.'])

    sheet.getColumn(3).width = 60
    sheet.getColumn(9).width = 30

    const buffer = await workbook.xlsx.writeBuffer()
    
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `jobs_template_${timestamp}.xlsx`

    // Convert to proper Buffer if needed
    const responseBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

    const excelResponse = new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    const corsResponse = withCors(excelResponse, origin)
    corsResponse.headers.set(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Content-Type'
    )

    return corsResponse
    
  } catch (error) {
    const message = formatError(error)
    return withCors(
      ApiResponse.error(message || 'Error generating template', 500),
      origin
    )
  }
}