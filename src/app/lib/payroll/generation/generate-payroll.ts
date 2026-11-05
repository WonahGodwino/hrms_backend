// src/app/lib/payroll/generation/generate-payroll.ts
//
// Auto-generates a draft payroll for every active staff member in a company
// for a given period, writing one PayrollData row per staff (status
// 'GENERATED') instead of the final Payroll/Payslip records the upload path
// creates immediately — this is the review-before-approve gate the manual
// upload flow doesn't have. Nothing here is called by, or shares code with,
// the manual upload path (dynamic-processor.ts) — see finalize-generated-payroll.ts
// for the "approve" step that turns a reviewed run into real records.
//
// Split into a fast synchronous part (startPayrollGeneration — creates the
// run row so there's immediately something to poll) and a slow background
// part (processPayrollGenerationInBackground), mirroring the same
// respond-immediately-then-keep-working pattern already used by the manual
// payroll upload and staff bulk-edit upload endpoints. The per-staff writes
// are deliberately NOT wrapped in a single $transaction: a company can have
// hundreds of staff, and Prisma's interactive transaction has a hard default
// timeout (5s) that a batch that size reliably blows through, aborting the
// whole run (see the P2028 "transaction expired" error this replaces). Each
// staff's PayrollData row is independent — there's no correctness reason
// they need all-or-nothing atomicity — and the upsert is idempotent, so a
// crash mid-run just leaves some staff already generated, safely resumed by
// the next Generate click.
import { prisma } from '@/app/lib/db'
import { resolveStaffPayrollFields, type PayrollTemplateFieldLike } from './field-resolver'
import { resolveDueLoanRepayments } from '@/app/lib/staff-loans-benefits/payroll-integration'

// Exported so other routes touching a PROCESSING run (e.g. the delete route's
// "can't delete while still generating" guard) use the same definition of
// "stuck", rather than each picking its own threshold.
export const STALE_RUN_THRESHOLD_MS = 15 * 60 * 1000

export type GeneratePayrollParams = {
  companyId: string
  templateId: string
  month: string // e.g. "August"
  year: number
  triggeredBy: string
  // Working days HR is counting for this pay period (e.g. 26) — one number
  // for the whole run, not per staff. Feeds the fixed, always-applied
  // attendance-based gross proration in field-resolver.ts.
  workingDaysInAMonth: number
  // Staff to skip for this specific period (e.g. someone on unpaid leave),
  // re-submitted in full on every Generate/regenerate click — this array is
  // the new authoritative exclusion list for the run, not a delta.
  excludedStaffIds: string[]
}

export type StartGenerationResult = {
  runId: string
  totalStaff: number
  payPeriod: string
}

/**
 * Returns the company's in-flight generation run for this template/period,
 * if any. A run stuck past the stale threshold (server restarted mid-run,
 * etc.) is marked FAILED and treated as if nothing were in flight, so
 * generation can never be permanently blocked.
 */
async function getActiveGenerationRun(companyId: string, templateId: string, payPeriod: string) {
  const active = await prisma.payrollGenerationRun.findFirst({
    where: { companyId, templateId, payPeriod, status: 'PROCESSING' },
    orderBy: { createdAt: 'desc' }
  })
  if (!active) return null

  if (Date.now() - active.createdAt.getTime() > STALE_RUN_THRESHOLD_MS) {
    await prisma.payrollGenerationRun.update({ where: { id: active.id }, data: { status: 'FAILED' } })
    return null
  }

  return active
}

/**
 * Fast, synchronous validation + run-row creation. Returns as soon as the
 * run exists (status PROCESSING) so the caller can respond to HR right away
 * and the review page has something to poll immediately.
 */
export async function startPayrollGeneration(params: GeneratePayrollParams): Promise<StartGenerationResult> {
  const { companyId, templateId, month, year, triggeredBy, workingDaysInAMonth, excludedStaffIds } = params
  const payPeriod = `${month} ${year}`

  const template = await prisma.payrollTemplate.findFirst({ where: { id: templateId, companyId } })
  if (!template) {
    throw new Error('Payroll template not found for this company')
  }

  const activeRun = await getActiveGenerationRun(companyId, templateId, payPeriod)
  if (activeRun) {
    throw new Error(`A payroll generation for ${payPeriod} is already in progress. Please wait for it to finish.`)
  }

  const totalActiveStaff = await prisma.staffRecord.count({ where: { companyId, isActive: true } })
  const totalStaff = await prisma.staffRecord.count({ where: { companyId, isActive: true, id: { notIn: excludedStaffIds } } })
  if (totalStaff === 0) {
    throw new Error(
      totalActiveStaff > 0 && excludedStaffIds.length > 0
        ? 'All active staff for this company are excluded for this period.'
        : 'No active staff found for this company'
    )
  }

  // One run row per company+template+period, ever-evolving through
  // PROCESSING -> GENERATED -> APPROVED -> (regenerate) -> PROCESSING -> ...
  // instead of a new row every click. Without this, regenerating an already
  // APPROVED period would create a second run pointing at the same
  // underlying PayrollData rows while the *original* run's page kept
  // showing stale APPROVED status with no way to review or re-approve the
  // corrected numbers from there.
  const existingRun = await prisma.payrollGenerationRun.findFirst({
    where: { companyId, templateId, payPeriod },
    orderBy: { createdAt: 'desc' }
  })

  const run = existingRun
    ? await prisma.payrollGenerationRun.update({
        where: { id: existingRun.id },
        data: {
          status: 'PROCESSING',
          totalStaff,
          flaggedCount: 0,
          triggeredBy,
          workingDaysInAMonth,
          excludedStaffIds,
          approvedBy: null,
          approvedAt: null
        }
      })
    : await prisma.payrollGenerationRun.create({
        data: {
          companyId,
          templateId,
          payPeriod,
          status: 'PROCESSING',
          totalStaff,
          flaggedCount: 0,
          triggeredBy,
          workingDaysInAMonth,
          excludedStaffIds
        }
      })

  return { runId: run.id, totalStaff, payPeriod }
}

/**
 * The slow part — resolves and writes one PayrollData row per staff member,
 * then flips the run to GENERATED (or FAILED on error). Intended to be
 * kicked off without awaiting it from the route handler, same as
 * processStaffBulkEditInBackground/dynamic-processor.ts's background calls.
 */
export async function processPayrollGenerationInBackground(runId: string): Promise<void> {
  const run = await prisma.payrollGenerationRun.findUnique({ where: { id: runId } })
  if (!run) return

  try {
    const template = await prisma.payrollTemplate.findFirst({
      where: { id: run.templateId, companyId: run.companyId },
      include: { fields: { orderBy: { order: 'asc' } } }
    })
    if (!template) {
      throw new Error('Payroll template not found for this company')
    }

    const staff = await prisma.staffRecord.findMany({
      where: { companyId: run.companyId, isActive: true, id: { notIn: run.excludedStaffIds } },
      select: { id: true, staffId: true, firstName: true, lastName: true, email: true, department: true }
    })

    // Drop any PayrollData row left over from a previous generation for
    // someone no longer in the resolved staff list (excluded since, or gone
    // inactive since) — otherwise a recompute only ever upserts, and a
    // staff member excluded after their row was already generated would
    // silently survive every recompute.
    await prisma.payrollData.deleteMany({
      where: {
        companyId: run.companyId,
        templateId: run.templateId,
        payPeriod: run.payPeriod,
        staffId: { notIn: staff.map((s) => s.id) }
      }
    })

    const profiles = await prisma.staffPayrollProfile.findMany({
      where: { staffId: { in: staff.map((s) => s.id) } },
      select: { staffId: true, values: true }
    })
    const profileByStaffId = new Map(profiles.map((p) => [p.staffId, p.values as Record<string, unknown>]))

    // Staff Loans & Benefits linkage — one batched query for every staff
    // member's due loan installment(s) this period, so the draft's Loan
    // Repayment deduction (see field-resolver.ts) reflects reality without
    // per-staff round trips.
    const loanRepaymentByStaffId = await resolveDueLoanRepayments({
      companyId: run.companyId,
      staffIds: staff.map((s) => s.id),
      payPeriod: run.payPeriod
    })

    const fieldsForResolver: PayrollTemplateFieldLike[] = template.fields.map((f) => ({
      systemField: f.systemField,
      displayName: f.displayName,
      dataType: f.dataType,
      section: f.section,
      required: f.required,
      showOnPayslip: f.showOnPayslip,
      order: f.order,
      valueSource: f.valueSource,
      formulaConfig: f.formulaConfig
    }))

    // "Month" is always the period this run was generated for, not
    // something read per staff — payPeriod is stored as "August 2026",
    // strip the trailing year the same way finalize-generated-payroll.ts does.
    // workingDaysInAMonth is likewise run-level, not per staff — set once when this
    // run was started (or last regenerated) and reused for every staff row.
    const periodContext = { month: run.payPeriod.replace(/\s+\d{4}$/, ''), workingDaysInAMonth: run.workingDaysInAMonth }

    let flaggedCount = 0

    for (const s of staff) {
      const { fields, needsReview } = resolveStaffPayrollFields(
        fieldsForResolver,
        profileByStaffId.get(s.id),
        {
          staffId: s.staffId,
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          department: s.department
        },
        periodContext,
        loanRepaymentByStaffId.get(s.id),
        (template.pensionCalculationBase as 'BHT' | 'STANDARD') || 'BHT'
      )
      if (needsReview) flaggedCount += 1

      const data = Object.fromEntries(
        fields.map((f) => [
          f.systemField,
          {
            value: f.value,
            displayName: f.displayName,
            dataType: f.dataType,
            section: f.section,
            required: f.required,
            showOnPayslip: f.showOnPayslip,
            source: f.source,
            // Only present for PERCENTAGE fields — lets a later edit adjust
            // the percent and recompute the amount instead of overwriting
            // the amount directly (see rows/[staffId] PATCH route).
            ...(f.percentageFormula ? { percentageFormula: f.percentageFormula } : {})
          }
        ])
      )

      await prisma.payrollData.upsert({
        where: { companyId_staffId_payPeriod: { companyId: run.companyId, staffId: s.id, payPeriod: run.payPeriod } },
        create: {
          companyId: run.companyId,
          templateId: run.templateId,
          staffId: s.id,
          payPeriod: run.payPeriod,
          data,
          status: 'GENERATED',
          generatedBy: run.triggeredBy,
          createdBy: run.triggeredBy
        },
        update: {
          templateId: run.templateId,
          data,
          status: 'GENERATED',
          generatedBy: run.triggeredBy,
          updatedBy: run.triggeredBy,
          // Clear any prior approval if this period is being regenerated.
          approvedBy: null,
          approvedAt: null,
          payrollId: null
        }
      })
    }

    await prisma.payrollGenerationRun.update({
      where: { id: runId },
      data: { status: 'GENERATED', totalStaff: staff.length, flaggedCount }
    })
  } catch (error) {
    console.error('[PAYROLL_GENERATION] Background processing error:', { runId, error })
    await prisma.payrollGenerationRun.update({ where: { id: runId }, data: { status: 'FAILED' } }).catch((updateError) => {
      console.error('[PAYROLL_GENERATION] Failed to mark run as FAILED:', { runId, updateError })
    })
  }
}
