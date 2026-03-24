/**
 * Payroll Engine Templates API Routes
 * GET /api/engine/templates?type=TYPE - Download bulk upload template
 *
 * Supported template types:
 * - EMPLOYEE_SALARY: For salary structure bulk import
 * - OVERTIME: For overtime entries upload
 * - DEDUCTIONS: For deduction entries upload (supports deductionType subtype)
 * - VALIDATIONS: For bulk payment validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import ExcelJS from 'exceljs'

// Template types
const TEMPLATE_TYPES = [
  'EMPLOYEE_SALARY',
  'OVERTIME',
  'DEDUCTIONS',
  'VALIDATIONS',
] as const

type TemplateType = typeof TEMPLATE_TYPES[number]

// Deduction subtypes for DEDUCTIONS template
const DEDUCTION_TYPES = [
  'UNION_DUES',
  'COOPERATIVE',
  'LOAN',
  'SALARY_ADVANCE',
  'OTHER',
] as const

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Authorization header missing' },
          { status: 401 }
        ),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'HR'])

    const { searchParams } = new URL(request.url)
    const templateType = searchParams.get('type')?.toUpperCase() as TemplateType
    const deductionType = searchParams.get('deductionType')?.toUpperCase()
    const format = searchParams.get('format') || 'excel'

    // If no type, return available templates info
    if (!templateType) {
      return withCors(
        NextResponse.json({
          success: true,
          message: 'Available payroll engine bulk upload templates',
          templates: [
            {
              type: 'EMPLOYEE_SALARY',
              description: 'Bulk import employee salary structures',
              endpoint: '/api/engine/employee-salaries/import',
              columns: {
                required: ['staffId', 'basicSalary'],
                optional: [
                  'employeeCategory', 'housingAllowance', 'transportAllowance',
                  'dressingAllowance', 'leaveAllowance', 'entertainmentAllowance',
                  'utilityAllowance', 'otherAllowances', 'annualRent', 'bankName',
                  'accountNumber', 'accountName', 'pensionFundAdministrator',
                  'pensionPin', 'effectiveDate'
                ]
              }
            },
            {
              type: 'OVERTIME',
              description: 'Bulk upload overtime entries for a pay period',
              endpoint: '/api/engine/overtime/upload/[periodId]',
              columns: {
                required: ['staffId', 'overtimeHours'],
                optional: ['multiplier', 'description']
              }
            },
            {
              type: 'DEDUCTIONS',
              description: 'Bulk upload deduction entries for a pay period',
              endpoint: '/api/engine/deductions/upload/[periodId]?type=DEDUCTION_TYPE',
              deductionTypes: DEDUCTION_TYPES,
              columns: {
                required: ['staffId', 'amount'],
                optional: ['description']
              }
            },
            {
              type: 'VALIDATIONS',
              description: 'Bulk validate staff payment status for a pay period',
              endpoint: '/api/engine/validations?action=bulk',
              columns: {
                required: ['staffId', 'status'],
                optional: ['reason']
              },
              statusValues: ['YES_FOR_PAYMENT', 'NO_FOR_PAYMENT']
            }
          ]
        }),
        origin
      )
    }

    if (!TEMPLATE_TYPES.includes(templateType)) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: `Invalid template type. Valid types: ${TEMPLATE_TYPES.join(', ')}`
          },
          { status: 400 }
        ),
        origin
      )
    }

    // Generate the template
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'iSurfHR Payroll Engine'
    workbook.created = new Date()

    let filename = ''

    switch (templateType) {
      case 'EMPLOYEE_SALARY':
        filename = generateEmployeeSalaryTemplate(workbook)
        break
      case 'OVERTIME':
        filename = generateOvertimeTemplate(workbook)
        break
      case 'DEDUCTIONS':
        filename = generateDeductionsTemplate(workbook, deductionType)
        break
      case 'VALIDATIONS':
        filename = generateValidationsTemplate(workbook)
        break
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return response
    const response = new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    return withCors(response, origin)
  } catch (error: any) {
    console.error('Template generation error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to generate template' },
        { status: 500 }
      ),
      origin
    )
  }
}

/**
 * Generate Employee Salary Import Template
 */
function generateEmployeeSalaryTemplate(workbook: ExcelJS.Workbook): string {
  const worksheet = workbook.addWorksheet('Employee Salary Import')

  // Define columns
  worksheet.columns = [
    { header: 'staffId', key: 'staffId', width: 20 },
    { header: 'basicSalary', key: 'basicSalary', width: 15 },
    { header: 'employeeCategory', key: 'employeeCategory', width: 18 },
    { header: 'housingAllowance', key: 'housingAllowance', width: 18 },
    { header: 'transportAllowance', key: 'transportAllowance', width: 20 },
    { header: 'dressingAllowance', key: 'dressingAllowance', width: 18 },
    { header: 'leaveAllowance', key: 'leaveAllowance', width: 16 },
    { header: 'entertainmentAllowance', key: 'entertainmentAllowance', width: 22 },
    { header: 'utilityAllowance', key: 'utilityAllowance', width: 18 },
    { header: 'otherAllowances', key: 'otherAllowances', width: 16 },
    { header: 'annualRent', key: 'annualRent', width: 14 },
    { header: 'bankName', key: 'bankName', width: 20 },
    { header: 'accountNumber', key: 'accountNumber', width: 18 },
    { header: 'accountName', key: 'accountName', width: 25 },
    { header: 'pensionFundAdministrator', key: 'pensionFundAdministrator', width: 25 },
    { header: 'pensionPin', key: 'pensionPin', width: 18 },
    { header: 'effectiveDate', key: 'effectiveDate', width: 15 },
  ]

  // Style header row
  styleHeaderRow(worksheet, 1, 'FF2F5496')

  // Add sample data rows
  const sampleData = [
    {
      staffId: 'EMP001',
      basicSalary: 350000,
      employeeCategory: 'REGULAR',
      housingAllowance: 75000,
      transportAllowance: 30000,
      dressingAllowance: 15000,
      leaveAllowance: 10000,
      entertainmentAllowance: 10000,
      utilityAllowance: 10000,
      otherAllowances: 0,
      annualRent: 1200000,
      bankName: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'John Doe',
      pensionFundAdministrator: 'ARM Pension',
      pensionPin: 'PEN123456789',
      effectiveDate: '2024-01-01',
    },
    {
      staffId: 'EMP002',
      basicSalary: 280000,
      employeeCategory: 'CONTRACT',
      housingAllowance: 60000,
      transportAllowance: 25000,
      dressingAllowance: 12000,
      leaveAllowance: 8000,
      entertainmentAllowance: 8000,
      utilityAllowance: 7000,
      otherAllowances: 0,
      annualRent: 960000,
      bankName: 'First Bank',
      accountNumber: '9876543210',
      accountName: 'Jane Smith',
      pensionFundAdministrator: 'Stanbic IBTC Pension',
      pensionPin: 'PEN987654321',
      effectiveDate: '2024-01-01',
    },
  ]

  sampleData.forEach((row) => worksheet.addRow(row))

  // Style data rows
  styleDataRows(worksheet, 2, 3)

  // Add instructions section
  addInstructionsSection(worksheet, 5, [
    'EMPLOYEE SALARY IMPORT TEMPLATE INSTRUCTIONS:',
    '',
    'REQUIRED COLUMNS:',
    '- staffId: Unique staff identifier (must match existing staff record)',
    '- basicSalary: Monthly basic salary amount (numeric, no currency symbols)',
    '',
    'OPTIONAL COLUMNS:',
    '- employeeCategory: REGULAR or CONTRACT (defaults to REGULAR)',
    '- housingAllowance: Monthly housing allowance (defaults to 0)',
    '- transportAllowance: Monthly transport allowance (defaults to 0)',
    '- dressingAllowance: Monthly dressing allowance (defaults to 0)',
    '- leaveAllowance: Monthly leave allowance (defaults to 0)',
    '- entertainmentAllowance: Monthly entertainment allowance (defaults to 0)',
    '- utilityAllowance: Monthly utility allowance (defaults to 0)',
    '- otherAllowances: Other monthly allowances (defaults to 0)',
    '- annualRent: Annual rent paid (for rent relief calculation)',
    '- bankName: Employee bank name',
    '- accountNumber: Bank account number',
    '- accountName: Account holder name',
    '- pensionFundAdministrator: PFA name',
    '- pensionPin: RSA PIN number',
    '- effectiveDate: Salary effective date (YYYY-MM-DD format)',
    '',
    'NOTES:',
    '- If staff already has an active salary structure, it will be updated',
    '- Delete these instruction rows before uploading',
    '- API Endpoint: POST /api/engine/employee-salaries/import',
  ])

  return `employee-salary-import-template-${Date.now()}.xlsx`
}

/**
 * Generate Overtime Upload Template
 */
function generateOvertimeTemplate(workbook: ExcelJS.Workbook): string {
  const worksheet = workbook.addWorksheet('Overtime Upload')

  // Define columns
  worksheet.columns = [
    { header: 'staffId', key: 'staffId', width: 20 },
    { header: 'overtimeHours', key: 'overtimeHours', width: 16 },
    { header: 'multiplier', key: 'multiplier', width: 12 },
    { header: 'description', key: 'description', width: 40 },
  ]

  // Style header row
  styleHeaderRow(worksheet, 1, 'FF4472C4')

  // Add sample data
  const sampleData = [
    {
      staffId: 'EMP001',
      overtimeHours: 10,
      multiplier: 1.5,
      description: 'Weekend overtime - Project deadline',
    },
    {
      staffId: 'EMP002',
      overtimeHours: 8,
      multiplier: 2.0,
      description: 'Public holiday work',
    },
    {
      staffId: 'EMP003',
      overtimeHours: 5,
      multiplier: 1.5,
      description: 'Extra hours - Month-end closing',
    },
  ]

  sampleData.forEach((row) => worksheet.addRow(row))

  // Style data rows
  styleDataRows(worksheet, 2, 4)

  // Add instructions
  addInstructionsSection(worksheet, 6, [
    'OVERTIME UPLOAD TEMPLATE INSTRUCTIONS:',
    '',
    'REQUIRED COLUMNS:',
    '- staffId: Unique staff identifier (must match existing staff record)',
    '- overtimeHours: Number of overtime hours worked (numeric)',
    '',
    'OPTIONAL COLUMNS:',
    '- multiplier: Overtime rate multiplier (defaults to 1.5)',
    '  - 1.5 = Regular overtime (150% of hourly rate)',
    '  - 2.0 = Weekend/Holiday overtime (200% of hourly rate)',
    '- description: Brief description of the overtime work',
    '',
    'NOTES:',
    '- Overtime is calculated based on: (Basic Salary / Monthly Hours) x Overtime Hours x Multiplier',
    '- Multiple entries for the same staff in a period are accumulated',
    '- Delete these instruction rows before uploading',
    '- API Endpoint: POST /api/engine/overtime/upload/[periodId]',
    '- Replace [periodId] with the actual pay period ID',
  ])

  return `overtime-upload-template-${Date.now()}.xlsx`
}

/**
 * Generate Deductions Upload Template
 */
function generateDeductionsTemplate(
  workbook: ExcelJS.Workbook,
  deductionType?: string
): string {
  const worksheet = workbook.addWorksheet('Deductions Upload')

  // Define columns
  worksheet.columns = [
    { header: 'staffId', key: 'staffId', width: 20 },
    { header: 'amount', key: 'amount', width: 15 },
    { header: 'description', key: 'description', width: 50 },
  ]

  // Style header row
  styleHeaderRow(worksheet, 1, 'FFED7D31')

  // Add sample data based on deduction type
  let sampleDescription = 'Monthly deduction'
  let templateTypeSuffix = 'general'

  switch (deductionType) {
    case 'UNION_DUES':
      sampleDescription = 'Monthly union membership dues'
      templateTypeSuffix = 'union-dues'
      break
    case 'COOPERATIVE':
      sampleDescription = 'Cooperative society contribution'
      templateTypeSuffix = 'cooperative'
      break
    case 'LOAN':
      sampleDescription = 'Staff loan repayment - Month X of Y'
      templateTypeSuffix = 'loan'
      break
    case 'SALARY_ADVANCE':
      sampleDescription = 'Salary advance recovery'
      templateTypeSuffix = 'salary-advance'
      break
    case 'OTHER':
      sampleDescription = 'Other deduction'
      templateTypeSuffix = 'other'
      break
  }

  const sampleData = [
    {
      staffId: 'EMP001',
      amount: 5000,
      description: sampleDescription,
    },
    {
      staffId: 'EMP002',
      amount: 10000,
      description: sampleDescription,
    },
    {
      staffId: 'EMP003',
      amount: 7500,
      description: sampleDescription,
    },
  ]

  sampleData.forEach((row) => worksheet.addRow(row))

  // Style data rows
  styleDataRows(worksheet, 2, 4)

  // Add instructions
  const typeInfo = deductionType
    ? `Current template configured for: ${deductionType}`
    : 'Specify deduction type in upload URL query parameter'

  addInstructionsSection(worksheet, 6, [
    'DEDUCTIONS UPLOAD TEMPLATE INSTRUCTIONS:',
    '',
    'REQUIRED COLUMNS:',
    '- staffId: Unique staff identifier (must match existing staff record)',
    '- amount: Deduction amount (numeric, positive value)',
    '',
    'OPTIONAL COLUMNS:',
    '- description: Description/reason for the deduction',
    '',
    'DEDUCTION TYPES:',
    '- UNION_DUES: Union membership dues',
    '- COOPERATIVE: Cooperative society contributions',
    '- LOAN: Loan repayments',
    '- SALARY_ADVANCE: Salary advance recovery',
    '- OTHER: Other miscellaneous deductions',
    '',
    typeInfo,
    '',
    'NOTES:',
    '- Each upload file should contain only ONE deduction type',
    '- The deduction type is specified in the URL query parameter',
    '- Multiple entries for the same staff and type are accumulated',
    '- Delete these instruction rows before uploading',
    '- API Endpoint: POST /api/engine/deductions/upload/[periodId]?type=DEDUCTION_TYPE',
    '- Replace [periodId] with the actual pay period ID',
    '- Replace DEDUCTION_TYPE with one of the valid types above',
  ])

  return `deductions-${templateTypeSuffix}-upload-template-${Date.now()}.xlsx`
}

/**
 * Generate Validations Upload Template
 */
function generateValidationsTemplate(workbook: ExcelJS.Workbook): string {
  const worksheet = workbook.addWorksheet('Bulk Validations')

  // Define columns
  worksheet.columns = [
    { header: 'staffId', key: 'staffId', width: 20 },
    { header: 'status', key: 'status', width: 20 },
    { header: 'reason', key: 'reason', width: 50 },
  ]

  // Style header row
  styleHeaderRow(worksheet, 1, 'FF70AD47')

  // Add sample data
  const sampleData = [
    {
      staffId: 'EMP001',
      status: 'YES_FOR_PAYMENT',
      reason: '',
    },
    {
      staffId: 'EMP002',
      status: 'YES_FOR_PAYMENT',
      reason: '',
    },
    {
      staffId: 'EMP003',
      status: 'NO_FOR_PAYMENT',
      reason: 'On suspension pending investigation',
    },
    {
      staffId: 'EMP004',
      status: 'NO_FOR_PAYMENT',
      reason: 'Resigned mid-month - partial payment processed separately',
    },
  ]

  sampleData.forEach((row) => worksheet.addRow(row))

  // Style data rows
  styleDataRows(worksheet, 2, 5)

  // Add conditional formatting hints
  worksheet.getColumn('status').eachCell((cell, rowNumber) => {
    if (rowNumber > 1 && cell.value === 'YES_FOR_PAYMENT') {
      cell.font = { color: { argb: 'FF006100' } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC6EFCE' },
      }
    } else if (rowNumber > 1 && cell.value === 'NO_FOR_PAYMENT') {
      cell.font = { color: { argb: 'FF9C0006' } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC7CE' },
      }
    }
  })

  // Add instructions
  addInstructionsSection(worksheet, 7, [
    'BULK VALIDATIONS TEMPLATE INSTRUCTIONS:',
    '',
    'REQUIRED COLUMNS:',
    '- staffId: Unique staff identifier (must match existing staff record)',
    '- status: Payment validation status (case-insensitive)',
    '  - YES_FOR_PAYMENT: Approve staff for payment',
    '  - NO_FOR_PAYMENT: Withhold staff from payment',
    '',
    'OPTIONAL COLUMNS:',
    '- reason: Explanation for the validation decision',
    '  - Required when status is NO_FOR_PAYMENT',
    '  - Optional for YES_FOR_PAYMENT',
    '',
    'WORKFLOW:',
    '1. Pay period validation window must be open',
    '2. Supervisors/Managers validate their team members',
    '3. HR/Admin can perform bulk validation',
    '4. Staff marked NO_FOR_PAYMENT are excluded from payroll',
    '',
    'NOTES:',
    '- Status values are case-insensitive (yes_for_payment also works)',
    '- Always provide a reason when withholding payment',
    '- Delete these instruction rows before uploading',
    '- API Endpoint: POST /api/engine/validations?action=bulk',
    '- Request body format: { payPeriodId: "...", validations: [...] }',
  ])

  return `bulk-validations-template-${Date.now()}.xlsx`
}

/**
 * Style header row with specified color
 */
function styleHeaderRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  bgColor: string
) {
  const headerRow = worksheet.getRow(rowNumber)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: bgColor },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 25

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
  })
}

/**
 * Style data rows with alternating colors
 */
function styleDataRows(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number
) {
  for (let i = startRow; i <= endRow; i++) {
    const row = worksheet.getRow(i)
    row.alignment = { vertical: 'middle', horizontal: 'left' }
    row.font = { size: 10 }

    if ((i - startRow) % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' },
      }
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      }
    })
  }
}

/**
 * Add instructions section to worksheet
 */
function addInstructionsSection(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  instructions: string[]
) {
  instructions.forEach((instruction, index) => {
    const row = worksheet.getRow(startRow + index)
    row.getCell(1).value = instruction

    if (index === 0) {
      // Title row
      row.getCell(1).font = { bold: true, color: { argb: 'FF2F5496' }, size: 11 }
      row.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCE6F1' },
      }
    } else if (
      instruction.startsWith('REQUIRED') ||
      instruction.startsWith('OPTIONAL') ||
      instruction.startsWith('DEDUCTION TYPES') ||
      instruction.startsWith('WORKFLOW') ||
      instruction.startsWith('NOTES')
    ) {
      // Section headers
      row.getCell(1).font = { bold: true, italic: true, size: 10 }
    } else if (instruction.startsWith('-')) {
      // Bullet points
      row.getCell(1).font = { size: 10 }
      row.getCell(1).alignment = { indent: 1 }
    } else if (instruction.startsWith('  -')) {
      // Sub-bullet points
      row.getCell(1).font = { size: 10 }
      row.getCell(1).alignment = { indent: 2 }
    } else {
      row.getCell(1).font = { size: 10, italic: true }
    }
  })
}
