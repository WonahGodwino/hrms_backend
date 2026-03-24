/**
 * Payroll Engine Module
 *
 * Intelligent Payroll Computing Module for Nigerian companies
 * Implements Nigeria 2026 PAYE Tax Law with:
 * - Rent Relief (20% of annual rent, capped at N500,000)
 * - Consolidated Relief Allowance (CRA)
 * - N800,000 Zero Tax Threshold
 * - Progressive Tax Bands (7% - 24%)
 */

// Types and interfaces
export * from './types'

// Tax engine
export * as taxEngine from './tax-engine'

// Pay period management
export * as payPeriodService from './pay-period'

// Employee salary management
export * as employeeSalaryService from './employee-salary'

// Validation portal
export * as validationPortalService from './validation-portal'

// Overtime management
export * as overtimeService from './overtime'

// Deductions management
export * as deductionsService from './deductions'

// Payroll processor
export * as payrollProcessorService from './payroll-processor'

// Reports
export * as payrollReportsService from './payroll-reports'
