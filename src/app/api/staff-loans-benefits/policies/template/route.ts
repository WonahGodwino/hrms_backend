import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '247HR'
    workbook.created = new Date()

    // ======= LOAN TYPES Sheet =======
    const loanSheet = workbook.addWorksheet('Loan Types', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })

    loanSheet.columns = [
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Interest Rate (%)', key: 'interestRatePercent', width: 18 },
      { header: 'Max Duration (Months)', key: 'maxDurationMonths', width: 22 },
      { header: 'Max Amount (₦)', key: 'maxAmount', width: 18 },
      { header: 'Min Service (Months)', key: 'minServiceMonths', width: 22 },
      { header: 'Max Debt Ratio (%)', key: 'maxDebtRatioPercent', width: 20 },
      { header: 'Requires Guarantor (true/false)', key: 'requiresGuarantor', width: 28 },
      { header: 'Guarantor Threshold (₦)', key: 'guarantorThresholdAmount', width: 24 },
      { header: 'Guarantor - Must Be Active In Company (true/false)', key: 'guarantorMustBeActiveInCompany', width: 36 },
      { header: 'Guarantor - Must Not Have Active Loan (true/false)', key: 'guarantorMustNotHaveActiveLoan', width: 38 },
      { header: 'Salary Multiplier', key: 'salaryMultiplier', width: 18 },
      { header: 'Active (true/false)', key: 'isActive', width: 18 },
      { header: 'Rules / Notes', key: 'rules', width: 35 },
    ]

    // Style header row
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } } as ExcelJS.Fill,
      alignment: { vertical: 'middle' as const, horizontal: 'center' as const, wrapText: true } as any,
      border: {
        top: { style: 'thin' as const },
        left: { style: 'thin' as const },
        bottom: { style: 'thin' as const },
        right: { style: 'thin' as const },
      },
    }
    loanSheet.getRow(1).eachCell((cell) => {
      cell.font = headerStyle.font as any
      cell.fill = headerStyle.fill
      cell.alignment = headerStyle.alignment
      cell.border = headerStyle.border
    })
    loanSheet.getRow(1).height = 36

    // Sample data rows — booleans written as actual Excel booleans so
    // Excel displays TRUE/FALSE natively and the parser receives JS booleans.
    const sampleLoans = [
      ['Personal Loan',  5, 18, 2500000, 3, 40, false, null,    true,  false, 1.0, true,  'Standard personal loan for confirmed staff'],
      ['Emergency Loan', 2, 6,  750000,  1, 35, false, null,    true,  false, 0.5, true,  'Fast-track approval for urgent needs'],
      ['Asset Loan',     8, 24, 5000000, 6, 40, true,  1000000, true,  true,  1.5, true,  'Asset-backed loan with guarantor requirement'],
    ]
    sampleLoans.forEach((row) => {
      loanSheet.addRow(row)
    })

    // Add TRUE/FALSE dropdown validation to all boolean columns (7, 9, 10, 12)
    // Covers rows 2–200 so newly added rows also get the dropdown.
    const boolColumns = [7, 9, 10, 12]
    for (let r = 2; r <= 200; r++) {
      boolColumns.forEach((col) => {
        loanSheet.getRow(r).getCell(col).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"TRUE,FALSE"'],
          showErrorMessage: true,
          errorTitle: 'Invalid value',
          error: 'Please select TRUE or FALSE from the dropdown.',
        }
      })
    }

    // ======= BENEFIT TYPES Sheet =======
    const benefitSheet = workbook.addWorksheet('Benefit Types', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })

    benefitSheet.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Category', key: 'category', width: 14 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Monetary Value (₦)', key: 'monetaryValue', width: 20 },
      { header: 'Key Value (text)', key: 'keyValue', width: 30 },
      { header: 'Eligibility Rule (JSON)', key: 'eligibilityRule', width: 35 },
      { header: 'Active (true/false)', key: 'isActive', width: 18 },
    ]

    benefitSheet.getRow(1).eachCell((cell) => {
      cell.font = headerStyle.font as any
      cell.fill = { ...headerStyle.fill, fgColor: { argb: 'FF7C3AED' } } as any
      cell.alignment = headerStyle.alignment
      cell.border = headerStyle.border
    })
    benefitSheet.getRow(1).height = 36

    const sampleBenefits = [
      ['Comprehensive Health Coverage', 'Health',     'Primary staff and spouse cover',     500000, 'Up to ₦500,000 annual cover', '{"minServiceMonths":3}', true],
      ['Transportation Support',        'Financial',  'Monthly transportation support',       35000, '₦35,000 monthly support',      '{"minServiceMonths":0}', true],
      ['Professional Certification',    'Learning',   'Reimbursement for certifications',    200000, 'Up to ₦200,000 per year',     '{"minServiceMonths":6}', true],
      ['Wellness Allowance',            'Wellness',   'Quarterly wellness stipend',           25000, '₦25,000 quarterly',            '{"minServiceMonths":0}', true],
    ]
    sampleBenefits.forEach((row) => {
      benefitSheet.addRow(row)
    })

    // Dropdown validation for Active column (col 7) in Benefit Types sheet
    for (let r = 2; r <= 200; r++) {
      benefitSheet.getRow(r).getCell(7).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"TRUE,FALSE"'],
        showErrorMessage: true,
        errorTitle: 'Invalid value',
        error: 'Please select TRUE or FALSE from the dropdown.',
      }
    }

    // ======= INSTRUCTIONS Sheet =======
    const instructionSheet = workbook.addWorksheet('Instructions', {
      views: [{ state: 'frozen', ySplit: 0 }],
    })
    instructionSheet.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Instructions', key: 'instructions', width: 80 },
    ]
    const instructions = [
      ['Loan Types - Name', 'Required. Unique name for the loan type within your company.'],
      ['Loan Types - Interest Rate (%)', 'Annual interest rate as a number (e.g., 5 for 5%). Default: 5'],
      ['Loan Types - Max Duration (Months)', 'Maximum repayment period in months. Default: 12'],
      ['Loan Types - Max Amount (₦)', 'Maximum loan amount in Naira. Default: 500000'],
      ['Loan Types - Min Service (Months)', 'Minimum months of employment required. Default: 3'],
      ['Loan Types - Max Debt Ratio (%)', 'Maximum percentage of salary that can go to debt. Default: 40'],
      ['Loan Types - Requires Guarantor', 'Select TRUE or FALSE from the dropdown. Default: FALSE'],
      ['Loan Types - Guarantor Must Be Active In Company', 'Select TRUE or FALSE. Whether guarantor must be an active employee in the same company. Default: TRUE'],
      ['Loan Types - Guarantor Must Not Have Active Loan', 'Select TRUE or FALSE. If TRUE, guarantor must not have any active loan. Default: FALSE'],
      ['Loan Types - Salary Multiplier', 'Multiplier on gross salary for max borrowable. Default: 1.0'],
      ['Benefit Types - Category', 'Must be one of: Health, Financial, Learning, Wellness'],
      ['Benefit Types - Eligibility Rule', 'JSON object e.g. {"minServiceMonths":3}. Leave blank for open eligibility.'],
      ['', 'Delete sample rows before uploading your actual data.'],
      ['', 'Save as .xlsx and upload using the Upload Template button.'],
    ]
    instructions.forEach((row) => instructionSheet.addRow(row))
    instructionSheet.getRow(1).eachCell((cell) => {
      cell.font = headerStyle.font as any
      cell.fill = { ...headerStyle.fill, fgColor: { argb: 'FF059669' } } as any
      cell.alignment = headerStyle.alignment
      cell.border = headerStyle.border
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="loan_benefit_policy_template.xlsx"',
        'Content-Length': String(buffer.byteLength),
      },
    })
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}