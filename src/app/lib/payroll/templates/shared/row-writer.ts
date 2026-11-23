// src/app/lib/payroll/templates/shared/row-writer.ts
//
// Shared write/ledger plumbing for all payroll row processors
// (isurf-standard, dynamic-processor, blueridge) and the Generate flow's
// finalize step. Each processor keeps its own field-mapping/calculation
// logic — only the "commit this staff/period/category's Payroll + Payslip
// atomically" step lives here, so the collision-bug fix and its crash-safety
// guarantees are implemented exactly once.
import { prisma } from '@/app/lib/db'
import type { Prisma } from '@prisma/client'
import { uploadPayslipToS3 } from '@/app/lib/storage/payslip-storage'

/**
 * Per-row concurrency for upload processors — was hardcoded to 4 in each of
 * isurf-standard.ts/dynamic-processor.ts/blueridge.ts. Now one shared,
 * env-configurable constant, read once at module load. Only raise this past
 * the old default once the write path is known to hold DB connections for a
 * shorter time than before (it does, as of the upsert+transaction fix in
 * this same module) — a higher value here is safe now in a way it wasn't
 * under the old race-prone findFirst-then-branch pattern.
 */
export const UPLOAD_ROW_CONCURRENCY = (() => {
  const raw = Number(process.env.PAYROLL_UPLOAD_ROW_CONCURRENCY)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 4
})()

export { normalizePayslipCategory } from './category'
import { normalizePayslipCategory } from './category'

export interface UpsertPayrollAndPayslipInput {
  staffRecordId: string
  companyId: string
  month: string
  year: number
  /** Free-text, normalized internally — pass the template's raw category as-is. */
  category: string
  /** Payroll fields only — must NOT include staffRecordId/month/year/companyId/payslipCategory. */
  payrollData: Omit<
    Prisma.PayrollUncheckedCreateInput,
    'staffRecordId' | 'month' | 'year' | 'companyId' | 'payslipCategory'
  >
  /** Payslip fields only — must NOT include staffRecordId/month/year/companyId/payslipCategory/payrollId. */
  payslipData: Omit<Prisma.PayslipUncheckedCreateInput, 'payrollId' | 'staffRecordId' | 'month' | 'year' | 'companyId' | 'payslipCategory'>
  /** When set, the row's checkpoint is written in the same transaction (crash-safe resume). */
  uploadId?: string | null
  rowIndex?: number | null
}

export interface UpsertPayrollAndPayslipResult {
  payrollId: string
  payslipId: string
  category: string
  /** True if this staff/period/category already had a Payroll row before this call. */
  wasPayrollUpdate: boolean
  /** True if this staff/period/category already had a Payslip row before this call. */
  wasPayslipUpdate: boolean
  /**
   * The payslip's emailStatus BEFORE this call. Callers use this to skip
   * re-sending an email that already went out — important for a resumed
   * upload (re-running the whole file is safe for data because writes are
   * idempotent, but must not re-spam staff whose email already sent).
   */
  priorEmailStatus: string | null
}

/**
 * Atomically upserts one staff member's Payroll + Payslip row for a given
 * (month, year, category), keyed on the real DB unique constraint
 * (staffRecordId, month, year, companyId, payslipCategory) — not an
 * app-level findFirst-then-branch, which raced under concurrent row workers
 * and silently let different categories (Salary/TA/Bonus) overwrite each
 * other. Also writes the row's PayrollUploadRowResult checkpoint inside the
 * same transaction when uploadId/rowIndex are given, so a crash between the
 * DB commit and the checkpoint write can never happen — "the checkpoint
 * exists" and "the row's data is durably committed" become the same fact.
 */
export async function upsertPayrollAndPayslip(
  input: UpsertPayrollAndPayslipInput
): Promise<UpsertPayrollAndPayslipResult> {
  const category = normalizePayslipCategory(input.category)
  const keyWhere = {
    staffRecordId: input.staffRecordId,
    month: input.month,
    year: input.year,
    companyId: input.companyId,
    payslipCategory: category,
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingPayroll = await tx.payroll.findUnique({
      where: { staffRecordId_month_year_companyId_payslipCategory: keyWhere },
      select: { id: true },
    })

    const payroll = await tx.payroll.upsert({
      where: { staffRecordId_month_year_companyId_payslipCategory: keyWhere },
      create: { ...input.payrollData, ...keyWhere },
      update: { ...input.payrollData, payslipCategory: category, updatedAt: new Date() },
    })

    const existingPayslip = await tx.payslip.findUnique({
      where: { staffRecordId_month_year_companyId_payslipCategory: keyWhere },
      select: { id: true, emailStatus: true },
    })

    const payslip = await tx.payslip.upsert({
      where: { staffRecordId_month_year_companyId_payslipCategory: keyWhere },
      create: { ...input.payslipData, ...keyWhere, payrollId: payroll.id },
      update: { ...input.payslipData, payslipCategory: category, updatedAt: new Date() },
    })

    if (input.uploadId != null && input.rowIndex != null) {
      await tx.payrollUploadRowResult.upsert({
        where: { uploadId_rowIndex: { uploadId: input.uploadId, rowIndex: input.rowIndex } },
        create: {
          uploadId: input.uploadId,
          rowIndex: input.rowIndex,
          status: 'SUCCESS',
          staffId: input.staffRecordId,
          category,
        },
        update: { status: 'SUCCESS', staffId: input.staffRecordId, category },
      })
    }

    return {
      payrollId: payroll.id,
      payslipId: payslip.id,
      category,
      wasPayrollUpdate: existingPayroll !== null,
      wasPayslipUpdate: existingPayslip !== null,
      priorEmailStatus: existingPayslip?.emailStatus ?? null,
    }
  })

  // Object storage (S3): best-effort upload after commit — never blocks or
  // fails the DB write; reads fall back to fileData while storage is off.
  try {
    const fileData = input.payslipData.fileData
    if (fileData) {
      await uploadPayslipToS3({
        payslipId: result.payslipId,
        companyId: input.companyId,
        payrollId: result.payrollId,
        bytes: fileData,
      })
    }
  } catch (e) {
    console.warn('[payslips] S3 upload skipped/failed', e)
  }

  return result
}
