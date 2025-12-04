// src/app/api/jobs/template/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    requireRole(token, ['HR', 'SUPER_ADMIN'])

    // Create Excel Template using ExcelJS
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Job Advertisement Template')

    // Add headers for the template
    worksheet.columns = [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Position', key: 'position', width: 20 },
      { header: 'Expiration Date', key: 'expirationDate', width: 20 },
    ]

    // Adding sample data for HR to fill in
    worksheet.addRow({
      title: 'Job Title',
      description: 'Job Description',
      department: 'Department Name',
      position: 'Job Position',
      expirationDate: 'YYYY-MM-DD',
    })

    // Save the file as a buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return the Excel file as a download response
    const excelResponse = new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="job_advertisement_template.xlsx"',
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(excelResponse, origin)
  } catch (error) {
    return withCors(ApiResponse.error(error.message || 'Error generating template', 500), origin)
  }
}
