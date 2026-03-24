// src/app/lib/payroll-engine/tax-filing/annual-return.ts
// Annual Return (Form H1) Generation

import { prisma } from '@/app/lib/db'
import { AnnualReturn, FilingStatus } from '@prisma/client'
import ExcelJS from 'exceljs'
import {
  AnnualReturnResponse,
  FormH1Data,
  AnnualEmployeeRecord,
  TaxCertificateData,
  ExportFormat,
} from './types'
import { getStateConfig, getStateName, STATE_CODES, getIRSName } from './states'
import { formatTin } from './tin-validator'
import { getEffectiveState } from './tax-profile'

// Month names
const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/**
 * Generate annual returns (Form H1) for all states for a year
 */
export async function generateAnnualReturns(
  companyId: string,
  year: number
): Promise<AnnualReturn[]> {
  // Get company info
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, companyName: true, taxId: true, address: true },
  })

  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  // Get all pay periods for the year
  const periods = await prisma.payPeriod.findMany({
    where: {
      companyId,
      year,
      status: { in: ['REVIEW', 'APPROVED', 'PAID'] },
    },
    orderBy: { month: 'asc' },
  })

  if (periods.length === 0) {
    throw new Error(`No completed pay periods found for ${year}`)
  }

  // Get all payslips for the year with tax profiles
  const allPayslips = await prisma.computedPayslip.findMany({
    where: {
      companyId,
      payPeriodId: { in: periods.map(p => p.id) },
      paymentStatus: { in: ['ACTIVE', 'PAID'] },
    },
    include: {
      payPeriod: true,
      staff: {
        include: {
          taxProfile: true,
        },
      },
    },
  })

  // Group by state and aggregate
  const stateData = new Map<string, {
    employees: Map<string, {
      staffId: string
      name: string
      jtbTin: string
      monthlyData: Map<number, { gross: number; tax: number }>
    }>
  }>()

  for (const payslip of allPayslips) {
    const taxProfile = payslip.staff.taxProfile
    if (!taxProfile) continue

    const state = getEffectiveState(taxProfile)
    const stateCode = STATE_CODES[state as keyof typeof STATE_CODES]
    if (!stateCode) continue

    // Initialize state data
    if (!stateData.has(stateCode)) {
      stateData.set(stateCode, { employees: new Map() })
    }

    const stateEmployees = stateData.get(stateCode)!.employees

    // Initialize employee data
    const employeeKey = payslip.staffId
    if (!stateEmployees.has(employeeKey)) {
      stateEmployees.set(employeeKey, {
        staffId: payslip.staff.staffId,
        name: `${payslip.staff.lastName.toUpperCase()}, ${payslip.staff.firstName}`,
        jtbTin: taxProfile.jtbTin ? formatTin(taxProfile.jtbTin) : '',
        monthlyData: new Map(),
      })
    }

    // Add monthly data
    const month = payslip.payPeriod.month
    stateEmployees.get(employeeKey)!.monthlyData.set(month, {
      gross: Number(payslip.grossSalary),
      tax: Number(payslip.monthlyPAYE),
    })
  }

  // Create annual returns for each state
  const returns: AnnualReturn[] = []

  for (const [stateCode, data] of stateData) {
    const stateName = getStateName(stateCode)
    if (!stateName) continue

    // Calculate totals
    let totalGrossIncome = 0
    let totalTaxPaid = 0

    for (const employee of data.employees.values()) {
      for (const monthData of employee.monthlyData.values()) {
        totalGrossIncome += monthData.gross
        totalTaxPaid += monthData.tax
      }
    }

    // Upsert annual return
    const annualReturn = await prisma.annualReturn.upsert({
      where: {
        companyId_year_stateCode: {
          companyId,
          year,
          stateCode,
        },
      },
      create: {
        companyId,
        year,
        stateIrs: getIRSName(stateName) || '',
        stateCode,
        stateName,
        totalEmployees: data.employees.size,
        totalGrossIncome,
        totalTaxPaid,
        status: 'GENERATED',
      },
      update: {
        totalEmployees: data.employees.size,
        totalGrossIncome,
        totalTaxPaid,
        status: 'GENERATED',
      },
    })

    returns.push(annualReturn)
  }

  return returns
}

/**
 * Build Form H1 data for a specific state
 */
export async function buildFormH1Data(
  companyId: string,
  year: number,
  stateCode: string
): Promise<FormH1Data | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, companyName: true, taxId: true, address: true },
  })

  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  const stateName = getStateName(stateCode)
  if (!stateName) {
    throw new Error(`Invalid state code: ${stateCode}`)
  }

  // Get all periods for the year
  const periods = await prisma.payPeriod.findMany({
    where: {
      companyId,
      year,
      status: { in: ['REVIEW', 'APPROVED', 'PAID'] },
    },
    orderBy: { month: 'asc' },
  })

  // Get payslips for employees in this state
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      companyId,
      payPeriodId: { in: periods.map(p => p.id) },
      paymentStatus: { in: ['ACTIVE', 'PAID'] },
    },
    include: {
      payPeriod: true,
      staff: {
        include: {
          taxProfile: true,
        },
      },
    },
  })

  // Filter and aggregate for this state
  const employeeData = new Map<string, {
    staffId: string
    name: string
    jtbTin: string
    monthlyData: { month: number; grossIncome: number; taxPaid: number }[]
  }>()

  for (const payslip of payslips) {
    const taxProfile = payslip.staff.taxProfile
    if (!taxProfile) continue

    const empState = getEffectiveState(taxProfile)
    const empStateCode = STATE_CODES[empState as keyof typeof STATE_CODES]
    if (empStateCode !== stateCode) continue

    const key = payslip.staffId
    if (!employeeData.has(key)) {
      employeeData.set(key, {
        staffId: payslip.staff.staffId,
        name: `${payslip.staff.lastName.toUpperCase()}, ${payslip.staff.firstName}`,
        jtbTin: taxProfile.jtbTin ? formatTin(taxProfile.jtbTin) : '',
        monthlyData: [],
      })
    }

    employeeData.get(key)!.monthlyData.push({
      month: payslip.payPeriod.month,
      grossIncome: Number(payslip.grossSalary),
      taxPaid: Number(payslip.monthlyPAYE),
    })
  }

  if (employeeData.size === 0) {
    return null
  }

  // Build employee records
  const employees: AnnualEmployeeRecord[] = []
  let sn = 1

  for (const [, data] of employeeData) {
    // Sort by month
    data.monthlyData.sort((a, b) => a.month - b.month)

    const annualGross = data.monthlyData.reduce((sum, m) => sum + m.grossIncome, 0)
    const annualTax = data.monthlyData.reduce((sum, m) => sum + m.taxPaid, 0)

    employees.push({
      sn: sn++,
      taxpayerName: data.name,
      jtbTin: data.jtbTin,
      staffId: data.staffId,
      annualGrossIncome: annualGross,
      annualTaxDeducted: annualTax,
      monthlyBreakdown: data.monthlyData,
    })
  }

  // Sort by name
  employees.sort((a, b) => a.taxpayerName.localeCompare(b.taxpayerName))
  employees.forEach((e, idx) => e.sn = idx + 1)

  return {
    companyInfo: {
      id: company.id,
      name: company.companyName,
      taxId: company.taxId,
      address: company.address,
    },
    year,
    stateCode,
    stateName,
    irsName: getIRSName(stateName) || '',
    employees,
    totals: {
      grossIncome: employees.reduce((sum, e) => sum + e.annualGrossIncome, 0),
      totalTaxDeducted: employees.reduce((sum, e) => sum + e.annualTaxDeducted, 0),
      employeeCount: employees.length,
    },
  }
}

/**
 * Generate Form H1 file
 */
export async function generateFormH1(
  companyId: string,
  year: number,
  stateCode: string,
  format: ExportFormat = 'xlsx'
): Promise<Buffer> {
  const data = await buildFormH1Data(companyId, year, stateCode)

  if (!data) {
    throw new Error(`No employees found for state ${stateCode} in ${year}`)
  }

  if (format === 'csv') {
    return generateFormH1CSV(data)
  }

  return generateFormH1Excel(data)
}

async function generateFormH1Excel(data: FormH1Data): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '24/7HR Tax Filing Module'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Form H1')

  // Header
  worksheet.mergeCells('A1:N1')
  worksheet.getCell('A1').value = 'FORM H1 - EMPLOYER\'S ANNUAL RETURN'
  worksheet.getCell('A1').font = { bold: true, size: 16 }
  worksheet.getCell('A1').alignment = { horizontal: 'center' }

  worksheet.mergeCells('A2:N2')
  worksheet.getCell('A2').value = `${data.irsName} - ${data.stateName}`
  worksheet.getCell('A2').font = { bold: true, size: 14 }
  worksheet.getCell('A2').alignment = { horizontal: 'center' }

  worksheet.mergeCells('A3:N3')
  worksheet.getCell('A3').value = `Year: ${data.year}`
  worksheet.getCell('A3').alignment = { horizontal: 'center' }

  // Company info
  worksheet.getCell('A5').value = 'Employer Name:'
  worksheet.getCell('B5').value = data.companyInfo.name
  worksheet.getCell('B5').font = { bold: true }

  worksheet.getCell('A6').value = 'Tax ID:'
  worksheet.getCell('B6').value = data.companyInfo.taxId || 'N/A'

  worksheet.getCell('A7').value = 'Address:'
  worksheet.getCell('B7').value = data.companyInfo.address || 'N/A'

  // Column headers
  const headerRow = 9
  const headers = [
    'S/N', 'TAXPAYER NAME', 'JTB TIN', 'STAFF ID',
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    'ANNUAL GROSS', 'ANNUAL TAX'
  ]

  worksheet.getRow(headerRow).values = headers
  const hr = worksheet.getRow(headerRow)
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hr.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2F5496' },
  }
  hr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  hr.height = 30

  // Set column widths
  worksheet.getColumn(1).width = 6
  worksheet.getColumn(2).width = 30
  worksheet.getColumn(3).width = 18
  worksheet.getColumn(4).width = 15
  for (let i = 5; i <= 16; i++) {
    worksheet.getColumn(i).width = 12
  }
  worksheet.getColumn(17).width = 15
  worksheet.getColumn(18).width = 15

  // Add data rows
  data.employees.forEach((emp, idx) => {
    const row = worksheet.getRow(headerRow + 1 + idx)

    // Build monthly tax array
    const monthlyTax: (number | string)[] = Array(12).fill('')
    emp.monthlyBreakdown.forEach(m => {
      monthlyTax[m.month - 1] = m.taxPaid
    })

    row.values = [
      emp.sn,
      emp.taxpayerName,
      emp.jtbTin,
      emp.staffId,
      ...monthlyTax,
      emp.annualGrossIncome,
      emp.annualTaxDeducted,
    ]

    // Format numbers
    for (let i = 5; i <= 18; i++) {
      const cell = row.getCell(i)
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00'
      }
    }

    // Alternate row colors
    if (idx % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' },
      }
    }
  })

  // Totals row
  const totalsRow = worksheet.getRow(headerRow + 1 + data.employees.length)
  totalsRow.values = [
    '', 'TOTAL', '', '',
    '', '', '', '', '', '',
    '', '', '', '', '', '',
    data.totals.grossIncome,
    data.totals.totalTaxDeducted,
  ]
  totalsRow.font = { bold: true }
  totalsRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E2F3' },
  }
  totalsRow.getCell(17).numFmt = '#,##0.00'
  totalsRow.getCell(18).numFmt = '#,##0.00'

  // Summary
  const summaryRow = headerRow + data.employees.length + 3
  worksheet.getCell(`A${summaryRow}`).value = `Total Employees: ${data.totals.employeeCount}`
  worksheet.getCell(`A${summaryRow + 1}`).value = `Total Tax Deducted: ${formatCurrency(data.totals.totalTaxDeducted)}`
  worksheet.getCell(`A${summaryRow + 2}`).value = `Generated: ${new Date().toISOString()}`

  // Freeze panes
  worksheet.views = [{ state: 'frozen', xSplit: 4, ySplit: headerRow }]

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

async function generateFormH1CSV(data: FormH1Data): Promise<Buffer> {
  const lines: string[] = []

  // Headers
  const headers = [
    'S/N', 'TAXPAYER NAME', 'JTB TIN', 'STAFF ID',
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    'ANNUAL GROSS', 'ANNUAL TAX'
  ]
  lines.push(headers.join(','))

  // Data rows
  data.employees.forEach(emp => {
    const monthlyTax: (number | string)[] = Array(12).fill('')
    emp.monthlyBreakdown.forEach(m => {
      monthlyTax[m.month - 1] = m.taxPaid.toFixed(2)
    })

    const row = [
      emp.sn,
      `"${emp.taxpayerName}"`,
      emp.jtbTin,
      emp.staffId,
      ...monthlyTax,
      emp.annualGrossIncome.toFixed(2),
      emp.annualTaxDeducted.toFixed(2),
    ]
    lines.push(row.join(','))
  })

  return Buffer.from(lines.join('\n'), 'utf-8')
}

/**
 * Generate tax certificate for an employee
 */
export async function generateTaxCertificate(
  staffId: string,
  year: number
): Promise<Buffer> {
  // Get staff with tax profile
  const staff = await prisma.staffRecord.findUnique({
    where: { id: staffId },
    include: {
      taxProfile: true,
      company: true,
    },
  })

  if (!staff) {
    throw new Error(`Staff not found: ${staffId}`)
  }

  // Get payslips for the year
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      staffId,
      paymentStatus: { in: ['ACTIVE', 'PAID'] },
      payPeriod: {
        year,
        status: { in: ['REVIEW', 'APPROVED', 'PAID'] },
      },
    },
    include: {
      payPeriod: true,
    },
    orderBy: {
      payPeriod: {
        month: 'asc',
      },
    },
  })

  if (payslips.length === 0) {
    throw new Error(`No payslips found for ${year}`)
  }

  // Build certificate data
  const data: TaxCertificateData = {
    employee: {
      id: staff.id,
      staffId: staff.staffId,
      name: `${staff.firstName} ${staff.lastName}`,
      email: staff.email,
      jtbTin: staff.taxProfile?.jtbTin ? formatTin(staff.taxProfile.jtbTin) : null,
      stateOfResidence: staff.taxProfile?.stateOfResidence || 'N/A',
    },
    company: {
      name: staff.company.companyName,
      taxId: staff.company.taxId,
      address: staff.company.address,
    },
    year,
    earnings: {
      totalGrossIncome: payslips.reduce((sum, p) => sum + Number(p.grossSalary), 0),
      totalBasicSalary: payslips.reduce((sum, p) => sum + Number(p.basicSalary), 0),
      totalAllowances: payslips.reduce((sum, p) => {
        return sum + Number(p.housingAllowance) + Number(p.transportAllowance) +
          Number(p.dressingAllowance) + Number(p.entertainmentAllowance) +
          Number(p.utilityAllowance) + Number(p.otherAllowances)
      }, 0),
    },
    deductions: {
      totalPension: payslips.reduce((sum, p) => sum + Number(p.pensionEmployee), 0),
      totalNHF: payslips.reduce((sum, p) => sum + Number(p.nhf), 0),
      totalNHIS: payslips.reduce((sum, p) => sum + Number(p.nhis), 0),
      totalPAYE: payslips.reduce((sum, p) => sum + Number(p.monthlyPAYE), 0),
    },
    monthlyBreakdown: payslips.map(p => ({
      month: p.payPeriod.month,
      monthName: MONTH_NAMES[p.payPeriod.month],
      grossIncome: Number(p.grossSalary),
      pension: Number(p.pensionEmployee),
      paye: Number(p.monthlyPAYE),
      netSalary: Number(p.netSalary),
    })),
  }

  return generateTaxCertificateExcel(data)
}

async function generateTaxCertificateExcel(data: TaxCertificateData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Tax Certificate')

  // Title
  worksheet.mergeCells('A1:F1')
  worksheet.getCell('A1').value = 'EMPLOYEE TAX CERTIFICATE'
  worksheet.getCell('A1').font = { bold: true, size: 18 }
  worksheet.getCell('A1').alignment = { horizontal: 'center' }

  worksheet.mergeCells('A2:F2')
  worksheet.getCell('A2').value = `Tax Year: ${data.year}`
  worksheet.getCell('A2').font = { size: 14 }
  worksheet.getCell('A2').alignment = { horizontal: 'center' }

  // Employee info
  worksheet.getCell('A4').value = 'Employee Name:'
  worksheet.getCell('B4').value = data.employee.name
  worksheet.getCell('B4').font = { bold: true }

  worksheet.getCell('A5').value = 'Staff ID:'
  worksheet.getCell('B5').value = data.employee.staffId

  worksheet.getCell('A6').value = 'JTB TIN:'
  worksheet.getCell('B6').value = data.employee.jtbTin || 'N/A'

  worksheet.getCell('A7').value = 'State of Residence:'
  worksheet.getCell('B7').value = data.employee.stateOfResidence

  worksheet.getCell('D4').value = 'Employer:'
  worksheet.getCell('E4').value = data.company.name
  worksheet.getCell('E4').font = { bold: true }

  worksheet.getCell('D5').value = 'Employer Tax ID:'
  worksheet.getCell('E5').value = data.company.taxId || 'N/A'

  // Annual summary
  worksheet.getCell('A9').value = 'ANNUAL SUMMARY'
  worksheet.getCell('A9').font = { bold: true, size: 14 }

  worksheet.getCell('A10').value = 'Total Gross Income:'
  worksheet.getCell('B10').value = data.earnings.totalGrossIncome
  worksheet.getCell('B10').numFmt = '#,##0.00'

  worksheet.getCell('A11').value = 'Total PAYE Tax Deducted:'
  worksheet.getCell('B11').value = data.deductions.totalPAYE
  worksheet.getCell('B11').numFmt = '#,##0.00'

  worksheet.getCell('A12').value = 'Total Pension Contribution:'
  worksheet.getCell('B12').value = data.deductions.totalPension
  worksheet.getCell('B12').numFmt = '#,##0.00'

  // Monthly breakdown header
  const monthlyStartRow = 14
  worksheet.getCell(`A${monthlyStartRow}`).value = 'MONTHLY BREAKDOWN'
  worksheet.getCell(`A${monthlyStartRow}`).font = { bold: true, size: 14 }

  const headerRow = monthlyStartRow + 1
  worksheet.getRow(headerRow).values = ['Month', 'Gross Income', 'Pension', 'PAYE', 'Net Salary']
  const hr = worksheet.getRow(headerRow)
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hr.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2F5496' },
  }

  // Monthly data
  data.monthlyBreakdown.forEach((m, idx) => {
    const row = worksheet.getRow(headerRow + 1 + idx)
    row.values = [m.monthName, m.grossIncome, m.pension, m.paye, m.netSalary]
    for (let i = 2; i <= 5; i++) {
      row.getCell(i).numFmt = '#,##0.00'
    }
  })

  // Set column widths
  worksheet.getColumn(1).width = 20
  worksheet.getColumn(2).width = 18
  worksheet.getColumn(3).width = 18
  worksheet.getColumn(4).width = 18
  worksheet.getColumn(5).width = 18
  worksheet.getColumn(6).width = 18

  // Footer
  const footerRow = headerRow + data.monthlyBreakdown.length + 3
  worksheet.getCell(`A${footerRow}`).value = `Generated: ${new Date().toISOString()}`
  worksheet.getCell(`A${footerRow}`).font = { italic: true, size: 10 }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Get list of annual returns for a year
 */
export async function getAnnualReturnsForYear(
  companyId: string,
  year: number
): Promise<AnnualReturnResponse[]> {
  const returns = await prisma.annualReturn.findMany({
    where: {
      companyId,
      year,
    },
    orderBy: { stateName: 'asc' },
  })

  return returns.map(r => ({
    id: r.id,
    companyId: r.companyId,
    year: r.year,
    stateIrs: r.stateIrs,
    stateCode: r.stateCode,
    stateName: r.stateName,
    totalEmployees: r.totalEmployees,
    totalGrossIncome: Number(r.totalGrossIncome),
    totalTaxPaid: Number(r.totalTaxPaid),
    status: r.status,
    filedAt: r.filedAt,
    filedBy: r.filedBy,
    formH1FilePath: r.formH1FilePath,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
}

/**
 * Mark annual return as filed
 */
export async function markAnnualReturnFiled(
  companyId: string,
  year: number,
  stateCode: string,
  filedBy: string
): Promise<AnnualReturn> {
  const annualReturn = await prisma.annualReturn.findFirst({
    where: {
      companyId,
      year,
      stateCode,
    },
  })

  if (!annualReturn) {
    throw new Error(`Annual return not found for state ${stateCode} in ${year}`)
  }

  return prisma.annualReturn.update({
    where: { id: annualReturn.id },
    data: {
      status: 'FILED',
      filedAt: new Date(),
      filedBy,
    },
  })
}

// Helper
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amount)
}