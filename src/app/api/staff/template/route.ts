// src/app/api/staff/template/route.ts
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/staff/template
 *
 * - HR / SUPER_ADMIN can download the standard staff upload template.
 * - Returns an .xlsx file with headers, sample rows and notes.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    requireRole(token, ['HR', 'SUPER_ADMIN','ADMIN'])

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Staff Records')

    // Columns
    worksheet.columns = [
      { header: 'staffId', key: 'staffId', width: 15 },
      { header: 'email', key: 'email', width: 25 },
      { header: 'firstName', key: 'firstName', width: 15 },
      { header: 'lastName', key: 'lastName', width: 15 },
      { header: 'department', key: 'department', width: 20 },
      { header: 'position', key: 'position', width: 20 },
      { header: 'phone', key: 'phone', width: 15 },
      { header: 'bankName', key: 'bankName', width: 20 },
      { header: 'accountNumber', key: 'accountNumber', width: 20 },
      { header: 'bvn', key: 'bvn', width: 15 },
    ]

    // Header styling
    const headerRow = worksheet.getRow(1)
    headerRow.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 12,
    }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F5496' },
    }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    // Sample data rows
    const sampleData = [
      {
        staffId: 'EMP001',
        email: 'john.doe@company.com',
        firstName: 'John',
        lastName: 'Doe',
        department: 'Customer Service',
        position: 'CSR',
        phone: '+2348012345678',
        bankName: 'GTBank',
        accountNumber: '0123456789',
        bvn: '12345678901',
      },
      {
        staffId: 'EMP002',
        email: 'jane.smith@company.com',
        firstName: 'Jane',
        lastName: 'Smith',
        department: 'Sales',
        position: 'Telesales Agent',
        phone: '+2348098765432',
        bankName: 'First Bank',
        accountNumber: '9876543210',
        bvn: '10987654321',
      },
    ]

    sampleData.forEach((row) => {
      worksheet.addRow(row)
    })

    // Zebra-striping & basic row styling
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: 'middle', horizontal: 'left' }
        row.font = { size: 11 }

        if (rowNumber % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' },
          }
        }
      }
    })

    // Notes
    worksheet.addRow([])
    worksheet.addRow(['IMPORTANT NOTES:'])
    worksheet.addRow([
      '- staffId: Unique staff ID (3-20 alphanumeric characters, REQUIRED)',
    ])
    worksheet.addRow(['- email: Valid email address (REQUIRED)'])
    worksheet.addRow(['- firstName, lastName: Staff names (REQUIRED)'])
    worksheet.addRow(['- department, position: Staff details (REQUIRED)'])
    worksheet.addRow([
      '- phone, bankName, accountNumber, bvn: Optional fields',
    ])

    for (let i = worksheet.rowCount - 6; i <= worksheet.rowCount; i++) {
      const noteRow = worksheet.getRow(i)
      noteRow.font = {
        italic: true,
        color: { argb: 'FFFF0000' },
        size: 10,
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()

    const excelResponse = new NextResponse(buffer as any, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="staff-records-template.xlsx"',
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(excelResponse, origin)
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
