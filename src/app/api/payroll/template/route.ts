// src/app/api/payroll/template/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { PAYROLL_TEMPLATES, PayrollTemplateType } from '@/app/lib/payroll/templates/types'

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

    // Get template type from query parameter
    const templateType = request.nextUrl.searchParams.get('type') as PayrollTemplateType
    const format = request.nextUrl.searchParams.get('format') || 'excel'
    
    if (!templateType || !PAYROLL_TEMPLATES[templateType]) {
      return withCors(
        ApiResponse.error('Valid template type is required. Supported types: ISURF_STANDARD, BLUERIDGE', 400),
        origin
      )
    }

    // Get current date for default month/year
    const now = new Date()
    const currentMonth = now.toLocaleString('default', { month: 'long' })
    const currentYear = now.getFullYear()

    // Create a new workbook
    const workbook = new ExcelJS.Workbook()
    
    // Get template configuration
    const templateConfig = PAYROLL_TEMPLATES[templateType]
    
    // Create worksheet with template name
    const worksheet = workbook.addWorksheet(`${templateType} Template`)
    
    // Define columns based on template type
    switch (templateType) {
      case 'ISURF_STANDARD':
        // ISURF_STANDARD template (original format)
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
        
        // Add sample data for ISURF_STANDARD
        const sampleRowData = {
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
        }
        
        worksheet.addRow(sampleRowData)
        break
        
      case 'BLUERIDGE':
        // BLUERIDGE template - matching the exact structure from the uploaded file
        // First, add the month header rows (merged cells)
        worksheet.mergeCells('A1:B1')
        worksheet.mergeCells('C1:D1')
        
        const row1 = worksheet.getRow(1)
        row1.getCell(1).value = `${currentMonth} Payroll; status : New hire, Termination/resigned, active`
        row1.getCell(3).value = `${currentMonth === 'December' ? 'January' : getNextMonth(currentMonth)} Payroll; status : New hire, Termination/resigned, active`
        
        // Add headers row (row 2)
        const headers = [
          'S/N',
          `${currentMonth} Payroll; status : New hire, Termination/resigned, active`,
          `${currentMonth === 'December' ? 'January' : getNextMonth(currentMonth)} Payroll; status : New hire, Termination/resigned, active`,
          'Staff ID',
          'Name',
          'Country',
          'State',
          'City',
          'Region',
          'Business\nLine',
          'Position verify (coe)',
          'Resumption Date',
          'Exit Date',
          'Working\nDays',
          'Worked\nDays',
          'Basic Salary before Verify(coe)',
          'basic Salary adjustment difference',
          'Target Performance Bonus before Verify(coe)',
          'HMO',
          'This Month\'s Gross',
          'Overtime Income (OI)',
          'Communication Allowance (CA)',
          'Transportation Allowance (TA)',
          'Outstanding Income (OI)',
          'Performance Bonus (PB)',
          'Basic',
          'Housing',
          'Transport',
          'Other Allowance',
          'Final Gross This Month (Salary + OI + CA + TA + OI)',
          'Final Gross Perfomance Bonus This Month',
          'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)',
          'Gross Monthly (Salary, OI, CA, TA, OI) for CRS Purpose',
          'Gross Performance Bonus for CRS Purpose',
          'Consolidated Relief Allowance (Salary, OI, CA, TA, OI)',
          'Consolidated Relief Allowance (Salary, OI, CA, TA, OI + Perfomance Bonus)',
          'Employee Pension Deduction',
          'Total Non-Taxable Income & Tax Exempt Item',
          'Total Reliefs and Deductions (Salary, OI, CA, TA, OI)',
          'Total Reliefs and Deductions (Salary, OI, CA, TA, OI & PB)',
          'Taxable Income - (Salary, OI, CA, TA, OI)',
          'Taxable Income - (Salary, OI, CA, TA, OI & PB)',
          'Tax Payable This Month (Salary, OI, CA, TA OI)',
          'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)',
          'Performance Bonus Tax',
          'Net (Salary, OI, CA, TA, OI)',
          'Net Performance Bonus',
          'Penalty & Deductions (After Tax)',
          'Total Net (Salary, OI, CA, TA, OI & PB)',
          'Employer Pension Contribution',
          'ECA',
          'Management Fees',
          'VAT on Management Fees',
          'Total Cost',
          'WHT on Management Fee',
          'Sum Payable',
          'Total Cost($)',
          'active or not',
          'Pay OPay',
          'Bank Payment',
          'Submitter',
          'OPay Account',
          'BVN',
          'Bank Name',
          'Acount Name',
          'Account Number',
          'HR Agency',
          'BA',
          'PFA Number',
          'Email'
        ]
        
        const row2 = worksheet.getRow(2)
        headers.forEach((header, index) => {
          const cell = row2.getCell(index + 1)
          cell.value = header
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true
          }
        })
        
        // Add sample data row (row 3)
        const row3 = worksheet.getRow(3)
        row3.getCell(1).value = 1 // S/N
        row3.getCell(2).value = 'Month'
        row3.getCell(3).value = 'Active' // Current month status
        row3.getCell(3).value = 'Active' // Next month status
        row3.getCell(4).value = 'BRC-Okash-9002' // Staff ID
        row3.getCell(5).value = 'Olatubosun Iyabo Victoria' // Name
        row3.getCell(6).value = 'Nigeria' // Country
        row3.getCell(7).value = 'Lagos' // State
        row3.getCell(8).value = 'Lagos' // City
        row3.getCell(9).value = '' // Region
        row3.getCell(10).value = 'BR Digital Finance' // Business Line
        row3.getCell(11).value = 'Collection Officer' // Position verify (coe)
        row3.getCell(12).value = '2025-04-24 00:00:00' // Resumption Date
        row3.getCell(13).value = 'Active' // Exit Date
        row3.getCell(14).value = 26 // Working Days
        row3.getCell(15).value = 26 // Worked Days
        row3.getCell(16).value = 80000 // Basic Salary before Verify(coe)
        row3.getCell(17).value = '' // basic Salary adjustment difference
        row3.getCell(18).value = 120000 // Target Performance Bonus before Verify(coe)
        row3.getCell(19).value = '' // HMO
        row3.getCell(20).value = 80000 // This Month's Gross
        row3.getCell(21).value = 0 // Overtime Income (OI)
        row3.getCell(22).value = 0 // Communication Allowance (CA)
        row3.getCell(23).value = 0 // Transportation Allowance (TA)
        row3.getCell(24).value = 0 // Outstanding Income (OI)
        row3.getCell(25).value = 0 // Performance Bonus (PB)
        row3.getCell(26).value = 28000 // Basic
        row3.getCell(27).value = 20000 // Housing
        row3.getCell(28).value = 16000 // Transport
        row3.getCell(29).value = 18000 // Other Allowance
        row3.getCell(30).value = 26000 // Final Gross This Month (Salary + OI + CA + TA + OI)
        row3.getCell(31).value = 80000 // Final Gross Perfomance Bonus This Month
        row3.getCell(32).value = 28000 // Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)
        row3.getCell(33).value = 108000 // Gross Monthly (Salary, OI, CA, TA, OI) for CRS Purpose
        row3.getCell(34).value = 75680 // Gross Performance Bonus for CRS Purpose
        row3.getCell(35).value = 103680 // Consolidated Relief Allowance (Salary, OI, CA, TA, OI)
        row3.getCell(36).value = 31802.6666666667 // Consolidated Relief Allowance (Salary, OI, CA, TA, OI + Perfomance Bonus)
        row3.getCell(37).value = 37402.6666666667 // Employee Pension Deduction
        row3.getCell(38).value = 4320 // Total Non-Taxable Income & Tax Exempt Item
        row3.getCell(39).value = 4320 // Total Reliefs and Deductions (Salary, OI, CA, TA, OI)
        row3.getCell(40).value = 36122.6666666667 // Total Reliefs and Deductions (Salary, OI, CA, TA, OI & PB)
        row3.getCell(41).value = 41722.6666666667 // Taxable Income - (Salary, OI, CA, TA, OI)
        row3.getCell(42).value = 43877.3333333333 // Taxable Income - (Salary, OI, CA, TA, OI & PB)
        row3.getCell(43).value = 66277.3333333333 // Tax Payable This Month (Salary, OI, CA, TA OI)
        row3.getCell(44).value = 3826.50666666667 // Tax Payable This Month (Salary, OI, CA, TA, OI & PB)
        row3.getCell(45).value = 6941.6 // Performance Bonus Tax
        row3.getCell(46).value = 3115.09333333333 // Net (Salary, OI, CA, TA, OI)
        row3.getCell(47).value = 71853.5 // Net Performance Bonus
        row3.getCell(48).value = 24884.91 // Penalty & Deductions (After Tax)
        row3.getCell(49).value = 96738.41 // Total Net (Salary, OI, CA, TA, OI & PB)
        row3.getCell(50).value = 5400 // Employer Pension Contribution
        row3.getCell(51).value = 1080 // ECA
        row3.getCell(52).value = 5600 // Management Fees
        row3.getCell(53).value = 420 // VAT on Management Fees
        row3.getCell(54).value = 121580 // Total Cost
        row3.getCell(55).value = 280 // WHT on Management Fee
        row3.getCell(56).value = 121300 // Sum Payable
        row3.getCell(57).value = 78.4387096774194 // Total Cost($)
        row3.getCell(58).value = '' // active or not
        row3.getCell(59).value = 10000 // Pay OPay
        row3.getCell(60).value = 86738.41 // Bank Payment
        row3.getCell(61).value = 'Raphael Ihenyen' // Submitter
        row3.getCell(62).value = '905 744 2834' // OPay Account
        row3.getCell(63).value = 22362503421 // BVN
        row3.getCell(64).value = 'Olatubosun Iyabo Victoria' // Bank Name
        row3.getCell(65).value = 'First bank' // Acount Name
        row3.getCell(66).value = 3060940046 // Account Number
        row3.getCell(68).value = 'Isurf' // HR Agency
        row3.getCell(69).value = 0 // BA
        row3.getCell(670).value = 0 // PFA Number
        row3.getCell(71).value = 'Victoriaiyabo1994@outlook.com' // Email
        
        // Style the headers (row 1 and 2)
        const headerRows = [1, 2]
        headerRows.forEach(rowNum => {
          const row = worksheet.getRow(rowNum)
          row.eachCell((cell) => {
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
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            }
          })
        })
        
        // Style the sample data row
        const dataRow = worksheet.getRow(3)
        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          }
        })
        
        // Set column widths
        const columnWidths = [8, 30, 30, 15, 25, 15, 15, 15, 15, 20, 20, 20, 15, 15, 15, 20, 20, 20, 15, 20, 20, 20, 20, 20, 20, 15, 15, 15, 15, 25, 25, 30, 30, 25, 30, 30, 25, 30, 30, 30, 25, 25, 30, 30, 20, 25, 20, 25, 25, 20, 15, 20, 20, 15, 20, 15, 15, 15, 15, 15, 20, 15, 15, 20, 20, 15, 15, 10, 10, 25]
        columnWidths.forEach((width, index) => {
          const column = worksheet.getColumn(index + 1)
          column.width = width
        })
        
        break
        
      default:
        return withCors(
          ApiResponse.error('Unsupported template type', 400),
          origin
        )
    }

    // Add instructions for both templates
    const instructionsStartRow = templateType === 'BLUERIDGE' ? 4 : 3
    
    if (templateType === 'ISURF_STANDARD') {
      worksheet.getRow(instructionsStartRow).values = [`${templateType} PAYROLL TEMPLATE INSTRUCTIONS:`]
      worksheet.getRow(instructionsStartRow + 1).values = ['1. Fill in employee data for each row']
      worksheet.getRow(instructionsStartRow + 2).values = ['2. Do not modify column headers or their order']
      worksheet.getRow(instructionsStartRow + 3).values = ['3. Required columns must have values']
      worksheet.getRow(instructionsStartRow + 4).values = ['4. Save as CSV for upload if using CSV format']
      worksheet.getRow(instructionsStartRow + 5).values = ['5. Delete these instruction rows before uploading the payroll']
      
      // Style instruction rows for ISURF_STANDARD
      for (let i = instructionsStartRow; i <= instructionsStartRow + 5; i++) {
        const row = worksheet.getRow(i)
        if (row.getCell(1)) {
          row.getCell(1).font = { bold: true, italic: true }
          if (i === instructionsStartRow) {
            row.getCell(1).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF0E68C' } // Light yellow for title
            }
          }
        }
      }
    } else if (templateType === 'BLUERIDGE') {
      // Add instructions for BLUERIDGE template
      const instructionRow = worksheet.getRow(instructionsStartRow)
      instructionRow.getCell(1).value = `${templateType} PAYROLL TEMPLATE INSTRUCTIONS:`
      instructionRow.getCell(1).font = { bold: true, color: { argb: 'FF0000FF' } } // Blue text
      
      const instructions = [
        '1. Fill in employee data starting from row 3',
        '2. Do not modify column headers or their order',
        '3. For "Resumption Date" and "Exit Date", use format: YYYY-MM-DD HH:MM:SS',
        '4. For "Exit Date", use "Active" for current employees',
        '5. Update "Staff ID" column with correct employee IDs',
        '6. Save as Excel (.xlsx) format for upload',
        '7. Delete these instruction rows before uploading the payroll'
      ]
      
      instructions.forEach((instruction, index) => {
        const row = worksheet.getRow(instructionsStartRow + index + 1)
        row.getCell(1).value = instruction
        row.getCell(1).font = { italic: true }
      })
    }

    // Freeze the header rows
    if (templateType === 'BLUERIDGE') {
      worksheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: 2 } // Freeze first 2 rows
      ]
    } else {
      worksheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: 1 } // Freeze first row
      ]
    }

    // Generate Excel buffer
    const excelBuffer = await workbook.xlsx.writeBuffer()

    // Offer both CSV and Excel formats
    if (format === 'csv') {
      // Create CSV content - simplified for BLUERIDGE due to complex structure
      let csvContent = ''
      
      if (templateType === 'ISURF_STANDARD') {
        const headers = worksheet.columns.map(col => col.header).join(',')
        const sampleValues = worksheet.getRow(2).values as any[]
        const sampleRow = sampleValues.slice(1).join(',')
        csvContent = `${headers}\n${sampleRow}`
      } else {
        // For BLUERIDGE, create a simplified CSV with key columns
        const keyHeaders = [
          'Staff ID',
          'Name',
          'Working Days',
          'Worked Days',
          'Basic Salary before Verify(coe)',
          'Housing',
          'Transport',
          'Other Allowance',
          'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)',
          'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)',
          'Employee Pension Deduction',
          'Total Net (Salary, OI, CA, TA, OI & PB)',
          'Email'
        ]
        
        const sampleData = [
          'BRC-Okash-9002',
          'Olatubosun Iyabo Victoria',
          '26',
          '26',
          '80000',
          '20000',
          '16000',
          '18000',
          '28000',
          '3826.50666666667',
          '37402.6666666667',
          '96738.41',
          'Victoriaiyabo1994@outlook.com'
        ]
        
        csvContent = `${keyHeaders.join(',')}\n${sampleData.join(',')}`
      }
      
      const response = new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${templateType.toLowerCase()}-payroll-template-${currentMonth}-${currentYear}.csv"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      })
      return withCors(response, origin)
    } else {
      // Return Excel version
      const uint8Array = new Uint8Array(excelBuffer)
      const response = new NextResponse(uint8Array, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${templateType.toLowerCase()}-payroll-template-${currentMonth}-${currentYear}.xlsx"`,
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

// Helper function to get next month
function getNextMonth(currentMonth: string): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const currentIndex = months.indexOf(currentMonth)
  const nextIndex = (currentIndex + 1) % 12
  return months[nextIndex]
}