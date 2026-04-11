// src/app/lib/payroll-engine/tax-filing/monthly-schedule.ts
// Monthly Tax Filing Schedule Generation

import { prisma } from '@/app/lib/db'
import { TaxFilingSchedule, FilingStatus } from '@prisma/client'
import ExcelJS from 'exceljs'
import {
  TaxFilingScheduleResponse,
  MonthlyScheduleData,
  ExportFormat,
} from './types'
import { getStateConfig, getStateName } from './states'
import {
  routeByResidency,
  buildMonthlyScheduleData,
  getStateSummaryForPeriod,
} from './residency-router'

/**
 * Generate monthly PAYE schedules for all states with employees
 */
export async function generateMonthlySchedules(
  companyId: string,
  periodId: string
): Promise<TaxFilingSchedule[]> {
  // Get period info
  const period = await prisma.payPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error(`Pay period not found: ${periodId}`)
  }

  if (period.companyId !== companyId) {
    throw new Error('Pay period does not belong to this company')
  }

  // Route employees by state
  const stateGroups = await routeByResidency(companyId, periodId)

  const schedules: TaxFilingSchedule[] = []

  for (const [stateCode, employees] of stateGroups) {
    const stateName = getStateName(stateCode)
    if (!stateName) continue

    const stateConfig = getStateConfig(stateName)
    if (!stateConfig) continue

    // Calculate totals
    const totalGrossIncome = employees.reduce((sum, e) => sum + e.grossIncome, 0)
    const totalTaxAmount = employees.reduce((sum, e) => sum + e.taxPayable, 0)

    // Upsert the schedule
    const schedule = await prisma.taxFilingSchedule.upsert({
      where: {
        companyId_payPeriodId_stateCode: {
          companyId,
          payPeriodId: periodId,
          stateCode,
        },
      },
      create: {
        companyId,
        payPeriodId: periodId,
        stateIrs: stateConfig.irsName,
        stateCode,
        stateName: stateConfig.name,
        totalEmployees: employees.length,
        totalTaxAmount,
        totalGrossIncome,
        status: 'GENERATED',
      },
      update: {
        totalEmployees: employees.length,
        totalTaxAmount,
        totalGrossIncome,
        status: 'GENERATED',
      },
    })

    schedules.push(schedule)
  }

  return schedules
}

/**
 * Generate schedule file for a specific state
 */
export async function generateStateSchedule(
  companyId: string,
  periodId: string,
  stateCode: string,
  format: ExportFormat = 'xlsx'
): Promise<Buffer> {
  const scheduleData = await buildMonthlyScheduleData(companyId, periodId, stateCode)

  if (!scheduleData) {
    throw new Error(`No employees found for state ${stateCode} in this period`)
  }

  if (format === 'csv') {
    return generateScheduleCSV(scheduleData)
  }

  return generateScheduleExcel(scheduleData)
}

/**
 * Generate Excel schedule file
 */
async function generateScheduleExcel(data: MonthlyScheduleData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '24/7HR Tax Filing Module'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('PAYE Schedule')

  // Add header info
  worksheet.mergeCells('A1:J1')
  worksheet.getCell('A1').value = `MONTHLY PAYE REMITTANCE SCHEDULE`
  worksheet.getCell('A1').font = { bold: true, size: 16 }
  worksheet.getCell('A1').alignment = { horizontal: 'center' }

  worksheet.mergeCells('A2:J2')
  worksheet.getCell('A2').value = `${data.irsName} - ${data.stateName}`
  worksheet.getCell('A2').font = { bold: true, size: 14 }
  worksheet.getCell('A2').alignment = { horizontal: 'center' }

  worksheet.mergeCells('A3:J3')
  worksheet.getCell('A3').value = `Period: ${data.period.periodName}`
  worksheet.getCell('A3').alignment = { horizontal: 'center' }

  // Company info
  worksheet.getCell('A5').value = 'Employer:'
  worksheet.getCell('B5').value = data.company.name
  worksheet.getCell('B5').font = { bold: true }

  worksheet.getCell('A6').value = 'Tax ID:'
  worksheet.getCell('B6').value = data.company.taxId || 'N/A'

  worksheet.getCell('A7').value = 'Address:'
  worksheet.getCell('B7').value = data.company.address || 'N/A'

  // Define columns for data
  const dataStartRow = 9
  const stateConfig = getStateConfig(data.stateName)
  const columns = stateConfig?.columns || []

  // Set column headers
  worksheet.getRow(dataStartRow).values = columns.map(c => c.header)

  // Style header row
  const headerRow = worksheet.getRow(dataStartRow)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2F5496' },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  headerRow.height = 30

  // Set column widths
  columns.forEach((col, idx) => {
    worksheet.getColumn(idx + 1).width = col.width
  })

  // Add data rows
  data.employees.forEach((emp, idx) => {
    const row = worksheet.getRow(dataStartRow + 1 + idx)
    row.values = [
      emp.sn,
      emp.taxpayerName,
      emp.jtbTin,
      emp.staffId,
      emp.grossIncome,
      emp.consolidatedRelief,
      emp.rentRelief,
      emp.pensionContribution,
      emp.taxPayable,
      emp.monthYear,
    ]

    // Style numeric columns
    row.getCell(5).numFmt = '#,##0.00'
    row.getCell(6).numFmt = '#,##0.00'
    row.getCell(7).numFmt = '#,##0.00'
    row.getCell(8).numFmt = '#,##0.00'
    row.getCell(9).numFmt = '#,##0.00'

    // Alternate row colors
    if (idx % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' },
      }
    }
  })

  // Add totals row
  const totalsRowNum = dataStartRow + 1 + data.employees.length
  const totalsRow = worksheet.getRow(totalsRowNum)
  totalsRow.values = [
    '',
    'TOTAL',
    '',
    '',
    data.totals.grossIncome,
    '',
    '',
    '',
    data.totals.taxAmount,
    '',
  ]
  totalsRow.font = { bold: true }
  totalsRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E2F3' },
  }
  totalsRow.getCell(5).numFmt = '#,##0.00'
  totalsRow.getCell(9).numFmt = '#,##0.00'

  // Add summary at bottom
  const summaryRow = totalsRowNum + 2
  worksheet.getCell(`A${summaryRow}`).value = `Total Employees: ${data.totals.employeeCount}`
  worksheet.getCell(`A${summaryRow + 1}`).value = `Total Tax Payable: ${formatCurrency(data.totals.taxAmount, data.company.baseCurrency)}`
  worksheet.getCell(`A${summaryRow + 2}`).value = `Generated: ${new Date().toISOString()}`

  // Freeze panes
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: dataStartRow }]

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Generate CSV schedule file
 */
async function generateScheduleCSV(data: MonthlyScheduleData): Promise<Buffer> {
  const lines: string[] = []

  // Header row
  const headers = [
    'S/N',
    'TAXPAYER NAME',
    'JTB TIN',
    'STAFF ID',
    'GROSS INCOME',
    'CONSOLIDATED RELIEF',
    'RENT RELIEF',
    'PENSION CONTRIBUTION',
    'TAX PAYABLE',
    'PERIOD',
  ]
  lines.push(headers.join(','))

  // Data rows
  data.employees.forEach(emp => {
    const row = [
      emp.sn,
      `"${emp.taxpayerName}"`,
      emp.jtbTin,
      emp.staffId,
      emp.grossIncome.toFixed(2),
      emp.consolidatedRelief.toFixed(2),
      emp.rentRelief.toFixed(2),
      emp.pensionContribution.toFixed(2),
      emp.taxPayable.toFixed(2),
      emp.monthYear,
    ]
    lines.push(row.join(','))
  })

  // Totals row
  lines.push('')
  lines.push(`,,,,${data.totals.grossIncome.toFixed(2)},,,,${data.totals.taxAmount.toFixed(2)},`)

  return Buffer.from(lines.join('\n'), 'utf-8')
}

/**
 * Get list of generated schedules for a period
 */
export async function getSchedulesForPeriod(
  companyId: string,
  periodId: string
): Promise<TaxFilingScheduleResponse[]> {
  const schedules = await prisma.taxFilingSchedule.findMany({
    where: {
      companyId,
      payPeriodId: periodId,
    },
    orderBy: { stateName: 'asc' },
  })

  return schedules.map(s => ({
    id: s.id,
    companyId: s.companyId,
    payPeriodId: s.payPeriodId,
    stateIrs: s.stateIrs,
    stateCode: s.stateCode,
    stateName: s.stateName,
    totalEmployees: s.totalEmployees,
    totalTaxAmount: Number(s.totalTaxAmount),
    totalGrossIncome: Number(s.totalGrossIncome),
    status: s.status,
    filedAt: s.filedAt,
    filedBy: s.filedBy,
    paymentReference: s.paymentReference,
    filePath: s.filePath,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }))
}

/**
 * Mark a schedule as filed
 */
export async function markScheduleFiled(
  companyId: string,
  periodId: string,
  stateCode: string,
  filedBy: string,
  paymentReference?: string
): Promise<TaxFilingSchedule> {
  const schedule = await prisma.taxFilingSchedule.findFirst({
    where: {
      companyId,
      payPeriodId: periodId,
      stateCode,
    },
  })

  if (!schedule) {
    throw new Error(`Schedule not found for state ${stateCode}`)
  }

  return prisma.taxFilingSchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'FILED',
      filedAt: new Date(),
      filedBy,
      paymentReference,
    },
  })
}

/**
 * Confirm a filed schedule
 */
export async function confirmSchedule(
  scheduleId: string,
  filedBy: string
): Promise<TaxFilingSchedule> {
  return prisma.taxFilingSchedule.update({
    where: { id: scheduleId },
    data: {
      status: 'CONFIRMED',
      filedBy,
    },
  })
}

// ==================== HELPER FUNCTIONS ====================

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).format(amount)
}