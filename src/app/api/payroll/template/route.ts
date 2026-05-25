// src/app/api/payroll/template/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { PAYROLL_TEMPLATES } from '@/app/lib/payroll/templates/types'

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
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN','ADMIN'])

    // Get template type from query parameter
    const templateTypeParam = request.nextUrl.searchParams.get('type')
    const format = request.nextUrl.searchParams.get('format') || 'excel'
    
    if (!templateTypeParam || !(templateTypeParam in PAYROLL_TEMPLATES)) {
      return withCors(
        ApiResponse.error('Valid template type is required. Supported types: ISURF_STANDARD, BLUERIDGE', 400),
        origin
      )
    }

    const templateType = templateTypeParam as keyof typeof PAYROLL_TEMPLATES

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
        // CORRECTED BLUERIDGE template - Month column is just the month name
        
        // Define the correct headers
        const headers = [
          'S/N',
          'Month', // Just "Month" - not combined with status
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
          'Account Name',
          'Account Number',
          'HR Agency',
          'BA',
          'PFA Number',
          'Email'
        ]
        
        // Add headers row (row 1)
        const headerRow = worksheet.getRow(1)
        headers.forEach((header, index) => {
          const cell = headerRow.getCell(index + 1)
          cell.value = header
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true
          }
        })
        
        // Style the header row
        headerRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' } // Blue color instead of red
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
        
        // Add sample data row (row 2)
        const sampleRow = worksheet.getRow(2)
        sampleRow.getCell(1).value = 1 // S/N
        sampleRow.getCell(2).value = currentMonth // Just the month name (e.g., "January")
        sampleRow.getCell(3).value = 'BRC-8002' // Staff ID
        sampleRow.getCell(4).value = 'WGO' // Name
        sampleRow.getCell(5).value = 'Nigeria' // Country
        sampleRow.getCell(6).value = 'Lagos' // State
        sampleRow.getCell(7).value = 'Lagos' // City
        sampleRow.getCell(8).value = '' // Region
        sampleRow.getCell(9).value = 'BR Digital Finance' // Business Line
        sampleRow.getCell(10).value = 'Collection Officer' // Position verify (coe)
        sampleRow.getCell(11).value = '2025-04-24 00:00:00' // Resumption Date
        sampleRow.getCell(12).value = 'Active' // Exit Date
        sampleRow.getCell(13).value = 26 // Working Days
        sampleRow.getCell(14).value = 26 // Worked Days
        sampleRow.getCell(15).value = 80000 // Basic Salary before Verify(coe)
        sampleRow.getCell(16).value = '' // basic Salary adjustment difference
        sampleRow.getCell(17).value = 120000 // Target Performance Bonus before Verify(coe)
        sampleRow.getCell(18).value = '' // HMO
        sampleRow.getCell(19).value = 80000 // This Month's Gross
        sampleRow.getCell(20).value = 0 // Overtime Income (OI)
        sampleRow.getCell(21).value = 0 // Communication Allowance (CA)
        sampleRow.getCell(22).value = 0 // Transportation Allowance (TA)
        sampleRow.getCell(23).value = 0 // Outstanding Income (OI)
        sampleRow.getCell(24).value = 0 // Performance Bonus (PB)
        sampleRow.getCell(25).value = 28000 // Basic
        sampleRow.getCell(26).value = 20000 // Housing
        sampleRow.getCell(27).value = 16000 // Transport
        sampleRow.getCell(28).value = 18000 // Other Allowance
        sampleRow.getCell(29).value = 26000 // Final Gross This Month (Salary + OI + CA + TA + OI)
        sampleRow.getCell(30).value = 80000 // Final Gross Perfomance Bonus This Month
        sampleRow.getCell(31).value = 28000 // Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)
        sampleRow.getCell(32).value = 108000 // Gross Monthly (Salary, OI, CA, TA, OI) for CRS Purpose
        sampleRow.getCell(33).value = 75680 // Gross Performance Bonus for CRS Purpose
        sampleRow.getCell(34).value = 103680 // Consolidated Relief Allowance (Salary, OI, CA, TA, OI)
        sampleRow.getCell(35).value = 31802.6666666667 // Consolidated Relief Allowance (Salary, OI, CA, TA, OI + Perfomance Bonus)
        sampleRow.getCell(36).value = 37402.6666666667 // Employee Pension Deduction
        sampleRow.getCell(37).value = 4320 // Total Non-Taxable Income & Tax Exempt Item
        sampleRow.getCell(38).value = 4320 // Total Reliefs and Deductions (Salary, OI, CA, TA, OI)
        sampleRow.getCell(39).value = 36122.6666666667 // Total Reliefs and Deductions (Salary, OI, CA, TA, OI & PB)
        sampleRow.getCell(40).value = 41722.6666666667 // Taxable Income - (Salary, OI, CA, TA, OI)
        sampleRow.getCell(41).value = 43877.3333333333 // Taxable Income - (Salary, OI, CA, TA, OI & PB)
        sampleRow.getCell(42).value = 66277.3333333333 // Tax Payable This Month (Salary, OI, CA, TA OI)
        sampleRow.getCell(43).value = 3826.50666666667 // Tax Payable This Month (Salary, OI, CA, TA, OI & PB)
        sampleRow.getCell(44).value = 6941.6 // Performance Bonus Tax
        sampleRow.getCell(45).value = 3115.09333333333 // Net (Salary, OI, CA, TA, OI)
        sampleRow.getCell(46).value = 71853.5 // Net Performance Bonus
        sampleRow.getCell(47).value = 24884.91 // Penalty & Deductions (After Tax)
        sampleRow.getCell(48).value = 96738.41 // Total Net (Salary, OI, CA, TA, OI & PB)
        sampleRow.getCell(49).value = 5400 // Employer Pension Contribution
        sampleRow.getCell(50).value = 1080 // ECA
        sampleRow.getCell(51).value = 5600 // Management Fees
        sampleRow.getCell(52).value = 420 // VAT on Management Fees
        sampleRow.getCell(53).value = 121580 // Total Cost
        sampleRow.getCell(54).value = 280 // WHT on Management Fee
        sampleRow.getCell(55).value = 121300 // Sum Payable
        sampleRow.getCell(56).value = 78.43 // Total Cost($)
        sampleRow.getCell(57).value = '' // active or not
        sampleRow.getCell(58).value = 10000 // Pay OPay
        sampleRow.getCell(59).value = 86738.41 // Bank Payment
        sampleRow.getCell(60).value = 'Wonah G' // Submitter
        sampleRow.getCell(61).value = '905 744 2834' // OPay Account
        sampleRow.getCell(62).value = 2200000000 // BVN
        sampleRow.getCell(63).value = 'WGO' // Bank Name
        sampleRow.getCell(64).value = 'First bank' // Account Name
        sampleRow.getCell(65).value = 3060000000 // Account Number
        sampleRow.getCell(66).value = 'Isurf' // HR Agency
        sampleRow.getCell(67).value = 0 // BA
        sampleRow.getCell(68).value = 0 // PFA Number
        sampleRow.getCell(69).value = 'wgo@outlook.com' // Email
        
        // Style the sample data row
        sampleRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          }
        })
        
        // Set column widths (simplified for cleaner look)
        const columnWidths = [
          8,   // A: S/N
          12,  // B: Month (just month name, so narrower)
          15,  // C: Staff ID
          25,  // D: Name
          12,  // E: Country
          12,  // F: State
          12,  // G: City
          12,  // H: Region
          15,  // I: Business Line
          20,  // J: Position verify (coe)
          18,  // K: Resumption Date
          15,  // L: Exit Date
          12,  // M: Working Days
          12,  // N: Worked Days
          20,  // O: Basic Salary before Verify(coe)
          20,  // P: basic Salary adjustment difference
          20,  // Q: Target Performance Bonus before Verify(coe)
          12,  // R: HMO
          15,  // S: This Month's Gross
          15,  // T: Overtime Income (OI)
          20,  // U: Communication Allowance (CA)
          20,  // V: Transportation Allowance (TA)
          20,  // W: Outstanding Income (OI)
          20,  // X: Performance Bonus (PB)
          12,  // Y: Basic
          12,  // Z: Housing
          12,  // AA: Transport
          15,  // AB: Other Allowance
          25,  // AC: Final Gross This Month (Salary + OI + CA + TA + OI)
          25,  // AD: Final Gross Performance Bonus This Month
          30,  // AE: Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)
          30,  // AF: Gross Monthly (Salary, OI, CA, TA, OI) for CRS Purpose
          25,  // AG: Gross Performance Bonus for CRS Purpose
          30,  // AH: Consolidated Relief Allowance (Salary, OI, CA, TA, OI)
          30,  // AI: Consolidated Relief Allowance (Salary, OI, CA, TA, OI + Performance Bonus)
          25,  // AJ: Employee Pension Deduction
          30,  // AK: Total Non-Taxable Income & Tax Exempt Item
          30,  // AL: Total Reliefs and Deductions (Salary, OI, CA, TA, OI)
          30,  // AM: Total Reliefs and Deductions (Salary, OI, CA, TA, OI & PB)
          25,  // AN: Taxable Income - (Salary, OI, CA, TA, OI)
          25,  // AO: Taxable Income - (Salary, OI, CA, TA, OI & PB)
          30,  // AP: Tax Payable This Month (Salary, OI, CA, TA OI)
          30,  // AQ: Tax Payable This Month (Salary, OI, CA, TA, OI & PB)
          20,  // AR: Performance Bonus Tax
          20,  // AS: Net (Salary, OI, CA, TA, OI)
          20,  // AT: Net Performance Bonus
          25,  // AU: Penalty & Deductions (After Tax)
          25,  // AV: Total Net (Salary, OI, CA, TA, OI & PB)
          20,  // AW: Employer Pension Contribution
          12,  // AX: ECA
          15,  // AY: Management Fees
          15,  // AZ: VAT on Management Fees
          12,  // BA: Total Cost
          15,  // BB: WHT on Management Fee
          12,  // BC: Sum Payable
          12,  // BD: Total Cost($)
          12,  // BE: active or not
          12,  // BF: Pay OPay
          15,  // BG: Bank Payment
          15,  // BH: Submitter
          15,  // BI: OPay Account
          15,  // BJ: BVN
          15,  // BK: Bank Name
          15,  // BL: Account Name
          15,  // BM: Account Number
          12,  // BN: HR Agency
          8,   // BO: BA
          12,  // BP: PFA Number
          25   // BQ: Email
        ]
        
        columnWidths.forEach((width, index) => {
          const column = worksheet.getColumn(index + 1)
          column.width = width
        })
        
        // Format numeric columns for better readability
        const numericColumns = [13, 14, 15, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 58, 59, 62, 65];
        numericColumns.forEach(colIndex => {
          const column = worksheet.getColumn(colIndex);
          column.numFmt = '#,##0.00';
        });
        
        break
        
      default:
        return withCors(
          ApiResponse.error('Unsupported template type', 400),
          origin
        )
    }

    // Add instructions for both templates
    const instructionsStartRow = templateType === 'BLUERIDGE' ? 3 : 3
    
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
      // Add instructions for BLUERIDGE template - starting at row 3
      const instructionRow = worksheet.getRow(instructionsStartRow)
      instructionRow.getCell(1).value = `${templateType} PAYROLL TEMPLATE INSTRUCTIONS:`
      instructionRow.getCell(1).font = { bold: true, color: { argb: 'FF2E75B6' } } // Blue text
      instructionRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' } // Light gray background
      }
      
      const instructions = [
        '1. Fill in employee data starting from row 2 (below the header)',
        '2. Do not modify column headers or their order',
        '3. For "Resumption Date", use format: YYYY-MM-DD HH:MM:SS',
        '4. For "Exit Date", use "Active" for current employees or date in same format',
        '5. "Month" column (Column B) should contain just the month name (e.g., "January")',
        '6. Update "Staff ID" column with correct employee IDs',
        '7. Required columns: Staff ID, Name, Basic Salary, Housing, Transport, Other Allowance, etc.',
        '8. Save as Excel (.xlsx) format for upload',
        '9. Delete these instruction rows before uploading the payroll'
      ]
      
      instructions.forEach((instruction, index) => {
        const row = worksheet.getRow(instructionsStartRow + index + 1)
        row.getCell(1).value = instruction
        row.getCell(1).font = { italic: true }
        row.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9F9F9' } // Very light gray
        }
      })
      
      // Freeze the header row (row 1)
      worksheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: 1 }
      ]
    }

    // Generate Excel buffer
    const excelBuffer = await workbook.xlsx.writeBuffer()

    // Offer both CSV and Excel formats
    if (format === 'csv') {
      // Create CSV content
      let csvContent = ''
      
      if (templateType === 'ISURF_STANDARD') {
        const headers = worksheet.columns.map(col => col.header).join(',')
        const sampleValues = worksheet.getRow(2).values as any[]
        const sampleRow = sampleValues.slice(1).join(',')
        csvContent = `${headers}\n${sampleRow}`
      } else {
        // For BLUERIDGE CSV, include all columns
        const headers = [
          'S/N',
          'Month',
          'Staff ID',
          'Name',
          'Country',
          'State',
          'City',
          'Region',
          'Business Line',
          'Position verify (coe)',
          'Resumption Date',
          'Exit Date',
          'Working Days',
          'Worked Days',
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
          'Account Name',
          'Account Number',
          'HR Agency',
          'BA',
          'PFA Number',
          'Email'
        ]
        
        const sampleData = [
          '1',
          currentMonth,
          'BRC-8002',
          'WGO',
          'Nigeria',
          'Lagos',
          'Lagos',
          '',
          'BR Digital Finance',
          'Collection Officer',
          '2025-04-24 00:00:00',
          'Active',
          '26',
          '26',
          '80000',
          '',
          '120000',
          '',
          '80000',
          '0',
          '0',
          '0',
          '0',
          '0',
          '28000',
          '20000',
          '16000',
          '18000',
          '26000',
          '80000',
          '28000',
          '108000',
          '75680',
          '103680',
          '31802.6666666667',
          '37402.6666666667',
          '4320',
          '4320',
          '36122.66',
          '41722.66',
          '43877.3333333333',
          '66277.3333333333',
          '3826.50666666667',
          '6941.6',
          '3115.09333333333',
          '71853.5',
          '24884.91',
          '96738.41',
          '5400',
          '1080',
          '5600',
          '420',
          '121580',
          '280',
          '121300',
          '78.43',
          '',
          '10000',
          '86738.41',
          'Wonag GO',
          '905 744 2830',
          '22362503421',
          'WGO',
          'First bank',
          '3060000000',
          'Isurf',
          '0',
          '0',
          'wgo@outlook.com'
        ]
        
        csvContent = `${headers.join(',')}\n${sampleData.join(',')}`
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