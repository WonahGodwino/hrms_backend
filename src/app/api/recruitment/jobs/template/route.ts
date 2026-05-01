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
      'title',
      'description',
      'department',
      'position',
      'employmentType',
      'workplaceType',
      'experienceLevel',
      'salaryRange',
      'benefits',
      'locations',
      'expirationDate',
      'status'
    ]
    
    sheet.addRow(headers)

    sheet.addRow([
      'Senior Product Designer',
      '<h2>Job Description</h2><p>We are looking for a senior product designer...</p>',
      'Engineering',
      'Senior Product Designer',
      'Full-time',
      'Hybrid',
      'Senior',
      'N500,000 - N800,000',
      'health,equity,pto,gym',
      'Lagos:Ikeja,Abuja:Wuse',
      '2026-05-30',
      'ACTIVE'
    ])

    sheet.addRow([])
    sheet.addRow(['INSTRUCTIONS:'])
    sheet.addRow(['- benefits: comma-separated values without spaces'])
    sheet.addRow(['- locations: format "State:LGA" separated by commas'])
    sheet.addRow(['- employmentType: Full-time, Part-time, Contract, Intern, Temporary'])
    sheet.addRow(['- workplaceType: Remote, Hybrid, On-site'])
    sheet.addRow(['- experienceLevel: Entry, Mid, Senior, Lead, Executive'])
    sheet.addRow(['- expirationDate: YYYY-MM-DD format (leave empty for open-ended)'])
    sheet.addRow(['- status: DRAFT, ACTIVE, CLOSED, EXPIRED (default ACTIVE)'])

    sheet.getColumn(2).width = 50
    sheet.getColumn(9).width = 30
    sheet.getColumn(10).width = 30

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