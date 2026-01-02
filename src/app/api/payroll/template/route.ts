// src/app/api/payroll/template/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    // Get current date for default month/year
    const now = new Date()
    const currentMonth = now.toLocaleString('default', { month: 'long' })
    const currentYear = now.getFullYear()

    // Create a new workbook
    const workbook = new ExcelJS.Workbook()
    
    // Create worksheet
    const worksheet = workbook.addWorksheet('Payroll Template')
    
    // Define columns based on the sample CSV
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 20 },
      { header: 'EMAIL', key: 'email', width: 25 },
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Gross Pay', key: 'grossPay', width: 12 },
      { header: 'Basic', key: 'basic', width: 12 },
      { header: 'Housing', key: 'housing', width: 12 },
      { header: 'Transport', key: 'transport', width: 12 },
      { header: 'Dressing', key: 'dressing', width: 12 },
      { header: 'Leave Allowance', key: 'leaveAllowance', width: 15 },
      { header: 'Entertainment', key: 'entertainment', width: 15 },
      { header: 'Utility', key: 'utility', width: 12 },
      { header: 'Payee', key: 'payee', width: 12 },
      { header: 'Pension', key: 'pension', width: 12 },
      { header: 'Deduction', key: 'deduction', width: 12 },
      { header: 'Bonus KPI', key: 'bonusKPI', width: 12 },
      { header: 'Net Salary', key: 'netSalary', width: 12 },
      { header: 'FINAL GROSS', key: 'finalGross', width: 12 },
      { header: 'Medical Contribution', key: 'medicalContribution', width: 18 },
      { header: 'No of Working Days in the Month', key: 'totalWorkingDays', width: 25 },
      { header: 'No of days Worked', key: 'daysWorked', width: 15 },
      { header: 'Employer Pension', key: 'employerPension', width: 15 },
      { header: 'NSITF', key: 'nsitf', width: 12 },
      { header: 'Prorated Sub Total Invoice', key: 'proratedSubTotal', width: 22 },
      { header: 'Mgt Fee', key: 'managementFee', width: 12 },
      { header: 'Vat on Management Fee @7.5%', key: 'vatOnManagementFee', width: 25 },
      { header: 'Total Invoice Value', key: 'totalInvoiceValue', width: 18 }
    ]

    // Style the header row (row 1) with red fill
    const headerRow = worksheet.getRow(1)
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' } // Red color
      }
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' } // White text
      }
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: 'center',
        wrapText: true
      }
    })

    // Add a sample row with current month/year as default
    worksheet.addRow({
      name: 'John Doe',
      email: 'john.doe@company.com',
      month: currentMonth,
      year: currentYear,
      grossPay: 500000,
      basic: 350000,
      housing: 75000,
      transport: 30000,
      dressing: 15000,
      leaveAllowance: 10000,
      entertainment: 5000,
      utility: 5000,
      payee: 45000,
      pension: 50000,
      deduction: 0,
      bonusKPI: 0,
      netSalary: 405000,
      finalGross: 500000,
      medicalContribution: 5000,
      totalWorkingDays: 22,
      daysWorked: 22,
      employerPension: 50000,
      nsitf: 1000,
      proratedSubTotal: 450000,
      managementFee: 22500,
      vatOnManagementFee: 1687.5,
      totalInvoiceValue: 468187.5
    })

    // Add instructions in row 3
    worksheet.getRow(3).values = ['INSTRUCTIONS:']
    worksheet.getRow(4).values = ['1. Fill in employee data for each row']
    worksheet.getRow(5).values = ['2. Do not modify column headers']
    worksheet.getRow(6).values = ['3. Save as CSV for upload']
    worksheet.getRow(6).values = ['4.Delete these instruction before uploading the payroll']
    
    // Style instruction rows
    for (let i = 3; i <= 6; i++) {
      const row = worksheet.getRow(i)
      row.getCell(1).font = { bold: true, italic: true }
    }

    // Freeze the header row
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ]

    // Generate Excel buffer
    const excelBuffer = await workbook.xlsx.writeBuffer()

    // Create CSV content (plain text version)
    const headers = worksheet.columns.map(col => col.header).join(',')
    const csvContent = `${headers}\n${currentMonth},${currentYear},,,,,,,,,,,,,,,,,,,,,,,`

    // Offer both CSV and Excel formats based on query parameter
    const format = request.nextUrl.searchParams.get('format') || 'excel'
    
    if (format === 'csv') {
      // Return CSV version (no styling in CSV)
      const response = new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="payroll-template-${currentMonth}-${currentYear}.csv"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      })
      return withCors(response, origin)
    } else {
      // Return Excel version (with red header styling)
      const uint8Array = new Uint8Array(excelBuffer)
      const response = new NextResponse(uint8Array, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="payroll-template-${currentMonth}-${currentYear}.xlsx"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Content-Length': uint8Array.length.toString(),
        },
      })
      return withCors(response, origin)
    }

  } catch (error) {
    const message = formatError(error)
    console.error('Error generating payroll template:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}