// src/app/api/staff/template/route.ts
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { writeStyledTable, buildSubtitle, addInstructionsSheet, attachmentDisposition, safeFileName, XLSX_MIME } from '@/app/lib/excel/sheet-theme'
import { prisma } from '@/app/lib/db'
import { STAFF_PENSION_COLUMNS, STAFF_GROSS_COLUMN, PENSION_SAMPLE, PENSION_NOTES, addPfaDropdown } from '@/app/lib/staff/pension-fields'
import { NSITF_IDENTITY_COLUMNS, STAFF_HIRE_DATE_COLUMN, NSITF_IDENTITY_SAMPLE, NSITF_IDENTITY_NOTES } from '@/app/lib/staff/nsitf-identity-fields'

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    // The drawer passes the company it is uploading into; otherwise fall back to the token's company.
    const companyId = request.nextUrl.searchParams.get('companyId') || user.companyId
    const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } }) : null

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Staff Records')

    const columns = [
      { header: 'staffId', key: 'staffId', width: 18, align: 'left' as const },
      { header: 'email', key: 'email', width: 28, align: 'left' as const },
      { header: 'firstName', key: 'firstName', width: 16, align: 'left' as const },
      { header: 'lastName', key: 'lastName', width: 16, align: 'left' as const },
      { header: 'department', key: 'department', width: 22, align: 'left' as const },
      { header: 'position', key: 'position', width: 22, align: 'left' as const },
      { header: 'phone', key: 'phone', width: 16, align: 'left' as const },
      { header: 'bankName', key: 'bankName', width: 20, align: 'left' as const },
      { header: 'accountNumber', key: 'accountNumber', width: 20, align: 'left' as const },
      { header: 'bvn', key: 'bvn', width: 16, align: 'left' as const },
      STAFF_GROSS_COLUMN,
      ...STAFF_PENSION_COLUMNS,
      STAFF_HIRE_DATE_COLUMN,
      ...NSITF_IDENTITY_COLUMNS,
    ]

    const { firstDataRow } = writeStyledTable(worksheet, {
      title: 'Staff Upload Template',
      subtitle: buildSubtitle([company?.companyName, 'Fill one staff member per row', 'Replace the sample rows']),
      columns,
      rows: [
        { staffId: 'EMP001', email: 'john.doe@company.com', firstName: 'John', lastName: 'Doe', department: 'Customer Service', position: 'CSR', phone: '+2348012345678', bankName: 'GTBank', accountNumber: '0123456789', bvn: '12345678901', gross: '250000', ...PENSION_SAMPLE, hireDate: '2024-01-15', ...NSITF_IDENTITY_SAMPLE },
        { staffId: 'EMP002', email: 'jane.smith@company.com', firstName: 'Jane', lastName: 'Smith', department: 'Sales', position: 'Telesales Agent', phone: '+2348098765432', bankName: 'First Bank', accountNumber: '9876543210', bvn: '10987654321', gross: '', rsaPin: '', pfaCode: '' },
      ],
      autoFilter: false,
    })

    const pfaColumn = columns.findIndex((c) => c.key === 'pfaCode') + 1
    if (pfaColumn > 0 && companyId) {
      await addPfaDropdown(workbook, worksheet, { column: pfaColumn, firstRow: firstDataRow, lastRow: firstDataRow + 1000, companyId })
    }

    addInstructionsSheet(workbook, {
      title: 'Staff Upload Instructions',
      subtitle: buildSubtitle([company?.companyName, 'Read before filling the Staff Records sheet']),
      sections: [
        {
          heading: 'Important notes',
          lines: [
            'staffId: Unique staff ID (3-20 alphanumeric characters, REQUIRED)',
            'email: Valid email address (REQUIRED)',
            'firstName, lastName: Staff names (REQUIRED)',
            'department, position: Staff details (REQUIRED)',
            'phone, bankName, accountNumber, bvn: Optional fields',
            ...PENSION_NOTES,
            ...NSITF_IDENTITY_NOTES,
            'Replace the two sample rows with your own data, one staff member per row, starting on row 5',
          ],
        },
      ],
    })

    const buffer = await workbook.xlsx.writeBuffer()

    const excelResponse = new NextResponse(buffer as any, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': attachmentDisposition(`Staff Upload Template${company ? ` (${safeFileName(company.companyName)})` : ''}.xlsx`),
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
