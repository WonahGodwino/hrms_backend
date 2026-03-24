// src/app/lib/payroll-engine/tax-filing/residency-router.ts
// Tax Residency Router - Groups employees by state for tax filing

import { prisma } from '@/app/lib/db'
import { ComputedPayslip, EmployeeTaxProfile } from '@prisma/client'
import {
  EmployeeScheduleRow,
  MonthlyScheduleData,
  NigeriaState,
} from './types'
import { getStateConfig, getStateCode, getIRSName } from './states'
import { formatTin } from './tin-validator'
import { getEffectiveState } from './tax-profile'

// Month names for display
const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/**
 * Route employees by their state of residence for a specific period
 * Returns a Map of state code -> employee schedule rows
 */
export async function routeByResidency(
  companyId: string,
  periodId: string
): Promise<Map<string, EmployeeScheduleRow[]>> {
  // Get the pay period
  const period = await prisma.payPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error(`Pay period not found: ${periodId}`)
  }

  // Get all computed payslips for this period with tax profiles
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      companyId,
      payPeriodId: periodId,
      paymentStatus: { in: ['ACTIVE', 'PAID'] }, // Only include paid/active employees
    },
    include: {
      staff: {
        include: {
          taxProfile: true,
        },
      },
    },
  })

  // Group employees by state
  const stateGroups = new Map<string, EmployeeScheduleRow[]>()

  for (const payslip of payslips) {
    const taxProfile = payslip.staff.taxProfile

    if (!taxProfile) {
      // Skip employees without tax profiles
      continue
    }

    // Get effective state (locked or current)
    const state = getEffectiveState(taxProfile)
    const stateCode = getStateCode(state)

    if (!stateCode) {
      console.warn(`Invalid state for employee ${payslip.staffId}: ${state}`)
      continue
    }

    // Build employee row
    const row: EmployeeScheduleRow = {
      sn: 0, // Will be assigned later
      taxpayerName: formatTaxpayerName(payslip.staff.lastName, payslip.staff.firstName),
      jtbTin: taxProfile.jtbTin ? formatTin(taxProfile.jtbTin) : '',
      staffId: payslip.staff.staffId,
      grossIncome: Number(payslip.grossSalary),
      consolidatedRelief: Number(payslip.consolidatedReliefAllowance),
      rentRelief: Number(payslip.rentRelief),
      pensionContribution: Number(payslip.pensionEmployee),
      taxPayable: Number(payslip.monthlyPAYE),
      monthYear: `${MONTH_NAMES[period.month]} ${period.year}`,
    }

    // Add to state group
    if (!stateGroups.has(stateCode)) {
      stateGroups.set(stateCode, [])
    }
    stateGroups.get(stateCode)!.push(row)
  }

  // Assign serial numbers within each state group
  for (const [stateCode, rows] of stateGroups) {
    rows.sort((a, b) => a.taxpayerName.localeCompare(b.taxpayerName))
    rows.forEach((row, idx) => {
      row.sn = idx + 1
    })
  }

  return stateGroups
}

/**
 * Build monthly schedule data for a specific state
 */
export async function buildMonthlyScheduleData(
  companyId: string,
  periodId: string,
  stateCode: string
): Promise<MonthlyScheduleData | null> {
  // Get period
  const period = await prisma.payPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error(`Pay period not found: ${periodId}`)
  }

  // Get company
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      companyName: true,
      taxId: true,
      address: true,
    },
  })

  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  // Get state config
  const stateConfig = getStateConfig(getStateName(stateCode) || '')

  if (!stateConfig) {
    throw new Error(`Invalid state code: ${stateCode}`)
  }

  // Route employees
  const allGroups = await routeByResidency(companyId, periodId)
  const employees = allGroups.get(stateCode)

  if (!employees || employees.length === 0) {
    return null
  }

  // Calculate totals
  const totals = {
    grossIncome: employees.reduce((sum, e) => sum + e.grossIncome, 0),
    taxAmount: employees.reduce((sum, e) => sum + e.taxPayable, 0),
    employeeCount: employees.length,
  }

  return {
    stateCode,
    stateName: stateConfig.name,
    irsName: stateConfig.irsName,
    period: {
      year: period.year,
      month: period.month,
      periodName: period.periodName,
    },
    company: {
      id: company.id,
      name: company.companyName,
      taxId: company.taxId,
      address: company.address,
    },
    employees,
    totals,
  }
}

/**
 * Get summary of employees by state for a period
 */
export async function getStateSummaryForPeriod(
  companyId: string,
  periodId: string
): Promise<{
  state: string
  stateCode: string
  irsName: string
  employeeCount: number
  totalTax: number
}[]> {
  const groups = await routeByResidency(companyId, periodId)

  const summary: {
    state: string
    stateCode: string
    irsName: string
    employeeCount: number
    totalTax: number
  }[] = []

  for (const [stateCode, employees] of groups) {
    const stateName = getStateName(stateCode)
    if (!stateName) continue

    summary.push({
      state: stateName,
      stateCode,
      irsName: getIRSName(stateName) || '',
      employeeCount: employees.length,
      totalTax: employees.reduce((sum, e) => sum + e.taxPayable, 0),
    })
  }

  return summary.sort((a, b) => b.totalTax - a.totalTax)
}

/**
 * Get employees who are missing from tax filing (no tax profile)
 */
export async function getMissingEmployeesForPeriod(
  companyId: string,
  periodId: string
): Promise<{
  staffId: string
  name: string
  grossSalary: number
  paye: number
}[]> {
  const payslips = await prisma.computedPayslip.findMany({
    where: {
      companyId,
      payPeriodId: periodId,
      paymentStatus: { in: ['ACTIVE', 'PAID'] },
    },
    include: {
      staff: {
        include: {
          taxProfile: true,
        },
      },
    },
  })

  return payslips
    .filter(p => !p.staff.taxProfile)
    .map(p => ({
      staffId: p.staff.staffId,
      name: `${p.staff.firstName} ${p.staff.lastName}`,
      grossSalary: Number(p.grossSalary),
      paye: Number(p.monthlyPAYE),
    }))
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Format taxpayer name as "SURNAME, FirstName"
 */
function formatTaxpayerName(lastName: string, firstName: string): string {
  return `${lastName.toUpperCase()}, ${firstName}`
}

/**
 * Get state name from code (reverse lookup)
 */
function getStateName(code: string): string | null {
  const { STATE_CODES } = require('./states')
  for (const [name, stateCode] of Object.entries(STATE_CODES)) {
    if (stateCode === code) return name as string
  }
  return null
}
