// src/app/api/payroll/generate/[runId]/route.ts
//
// Run detail — the review page's data source. Returns the run plus one row
// per staff with their resolved field values, shaped for an
// inline-editable table. A row is flagged (needsReview) if any required
// MANUAL field is still blank, matching the same rule the generation engine
// used to compute PayrollGenerationRun.flaggedCount.
//
// DELETE removes an entire pay period — every PayrollData row, every
// PayrollGenerationRun row, and (since a period can have been approved)
// every Payroll/Payslip record it produced, including already-emailed PDF
// payslips. Deliberately scoped by companyId+templateId+payPeriod rather
// than just this one runId: a period can have more than one
// PayrollGenerationRun row (each "Generate" click adds one), and they all
// share the same underlying PayrollData rows, so "delete this pay period"
// means all of it, not just this run's history entry.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { isEarningsSection, GROSS_SYSTEM_FIELD, templateFieldDisplayRank, sortByTemplateOrder, type PercentageFormulaConfig } from '@/app/lib/payroll/generation/field-resolver'
import { STALE_RUN_THRESHOLD_MS } from '@/app/lib/payroll/generation/generate-payroll'

type StoredField = {
  value: unknown
  displayName: string
  dataType: string
  section: string
  required: boolean
  showOnPayslip: boolean
  source?: string
  percentageFormula?: PercentageFormulaConfig
}

function isDeductionsSection(section: string): boolean {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_') === 'DEDUCTIONS'
}

function isEmployerCostSection(section: string): boolean {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_') === 'EMPLOYER_COST'
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { runId: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    // Client-billing settings live on the template (see schema comment on
    // PayrollTemplate.payrollInvoicingEnabled) — one company can run several
    // templates for different clients, each with its own negotiated terms.
    // Selected here so the review page can render its invoice section
    // entirely from data already on the page; stays hidden client-side
    // whenever payrollInvoicingEnabled is false.
    const run = await prisma.payrollGenerationRun.findUnique({
      where: { id: params.runId },
      include: {
        template: {
          select: { templateName: true, payrollInvoicingEnabled: true, payrollManagementFeePercent: true, payrollVatPercent: true }
        }
      }
    })
    if (!run) {
      return withCors(ApiResponse.error('Generation run not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const rows = await prisma.payrollData.findMany({
      where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod },
      include: { staff: { select: { id: true, staffId: true, firstName: true, lastName: true, department: true, email: true } } },
      orderBy: { createdAt: 'asc' }
    })

    const excludedStaff = run.excludedStaffIds.length
      ? await prisma.staffRecord.findMany({
          where: { id: { in: run.excludedStaffIds } },
          select: { id: true, staffId: true, firstName: true, lastName: true, department: true }
        })
      : []

    // "Gross" in the review table means the raw, un-prorated figure HR
    // entered in Staff Compensation — not the `gross` key inside row.data,
    // which field-resolver.ts's attendance proration overwrites in place
    // with the attendance-adjusted figure (that's "Prorated Gross" below).
    // The only place the original, pre-proration number still exists is the
    // Compensation Profile itself, so it's fetched separately here.
    const staffIds = rows.map((row) => row.staffId)
    const profiles = staffIds.length
      ? await prisma.staffPayrollProfile.findMany({
          where: { staffId: { in: staffIds } },
          select: { staffId: true, values: true }
        })
      : []
    const rawGrossByStaffId = new Map(
      profiles.map((p) => {
        const raw = (p.values as Record<string, unknown> | null)?.[GROSS_SYSTEM_FIELD]
        const isEmpty = raw === null || raw === undefined || raw === ''
        const num = isEmpty ? NaN : Number(raw)
        return [p.staffId, Number.isFinite(num) ? num : null]
      })
    )

    // Fields go out in template-builder order so the review table shows
    // columns the way HR laid the template out (see templateFieldDisplayRank).
    const templateFields = await prisma.payrollTemplateField.findMany({ where: { templateId: run.templateId }, select: { systemField: true, section: true, order: true } })
    const displayRank = templateFieldDisplayRank(templateFields)

    const formattedRows = rows.map((row) => {
      const data = row.data as Record<string, StoredField>
      const fields = sortByTemplateOrder(Object.entries(data).map(([systemField, field]) => ({ systemField, ...field })), displayRank)
      const missingRequiredFields = fields.filter((f) => f.required && (f.value === null || f.value === undefined || f.value === '')).map((f) => f.displayName)

      // Same "gross pay / total deductions / net pay" a payslip shows —
      // computed the same way finalize-generated-payroll.ts computes it at
      // approval time, so what HR previews here is what they'll actually
      // get once approved.
      const grossPay = fields
        .filter((f) => isEarningsSection(f.section) && typeof f.value === 'number')
        .reduce((sum, f) => sum + (f.value as number), 0)
      const totalDeductions = fields
        .filter((f) => isDeductionsSection(f.section) && typeof f.value === 'number')
        .reduce((sum, f) => sum + (f.value as number), 0)
      // Real employer costs (Employer Pension, NSITF, Medical Contribution)
      // — never earnings, never deductions, never part of net pay. Exposed
      // per row so the review page's invoice section can sum it alongside
      // grossPay without re-deriving section logic client-side.
      const employerCost = fields
        .filter((f) => isEmployerCostSection(f.section) && typeof f.value === 'number')
        .reduce((sum, f) => sum + (f.value as number), 0)

      return {
        rowId: row.id,
        staffRecordId: row.staffId,
        staffId: row.staff.staffId,
        staffName: `${row.staff.firstName} ${row.staff.lastName}`,
        department: row.staff.department || '',
        email: row.staff.email,
        status: row.status,
        needsReview: missingRequiredFields.length > 0,
        missingRequiredFields,
        rawGross: rawGrossByStaffId.get(row.staffId) ?? null,
        grossPay,
        totalDeductions,
        employerCost,
        netPay: grossPay - totalDeductions,
        fields
      }
    })

    return withCors(
      ApiResponse.success(
        {
          run: {
            id: run.id,
            companyId: run.companyId,
            templateId: run.templateId,
            templateName: run.template.templateName,
            payPeriod: run.payPeriod,
            status: run.status,
            totalStaff: run.totalStaff,
            flaggedCount: run.flaggedCount,
            triggeredBy: run.triggeredBy,
            approvedBy: run.approvedBy,
            approvedAt: run.approvedAt,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt
          },
          templateBilling: {
            payrollInvoicingEnabled: !!run.template.payrollInvoicingEnabled,
            payrollManagementFeePercent: run.template.payrollManagementFeePercent != null ? Number(run.template.payrollManagementFeePercent) : null,
            payrollVatPercent: run.template.payrollVatPercent != null ? Number(run.template.payrollVatPercent) : null
          },
          excludedStaff: excludedStaff.map((s) => ({
            staffRecordId: s.id,
            staffId: s.staffId,
            staffName: `${s.firstName} ${s.lastName}`,
            department: s.department || ''
          })),
          rows: formattedRows
        },
        'Generation run retrieved'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { runId: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const run = await prisma.payrollGenerationRun.findUnique({ where: { id: params.runId } })
    if (!run) {
      return withCors(ApiResponse.error('Generation run not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    // A run genuinely still generating is protected from deletion, but one
    // stuck in PROCESSING past the same staleness threshold generate-payroll.ts
    // uses to detect an abandoned run (server restart, crash, power loss
    // mid-run) isn't actually in flight, it's just an orphaned row with
    // nothing left to finish. Blocking deletion of that forever, with no
    // recovery path short of a direct database fix, is the actual bug, not
    // a safety feature.
    const isStale = Date.now() - run.updatedAt.getTime() > STALE_RUN_THRESHOLD_MS
    if (run.status === 'PROCESSING' && !isStale) {
      return withCors(ApiResponse.error('This pay period is still being generated. Wait for it to finish before deleting it.', 409), origin)
    }

    const body = await request.json().catch(() => ({}))
    const confirmPayPeriod = typeof body?.confirmPayPeriod === 'string' ? body.confirmPayPeriod.trim() : ''
    if (confirmPayPeriod !== run.payPeriod) {
      return withCors(
        ApiResponse.error(`Type "${run.payPeriod}" exactly to confirm deleting this pay period.`, 400),
        origin
      )
    }

    // Every run for this exact company+template+period shares the same
    // underlying PayrollData rows — collect the real Payroll rows any of
    // them were approved into before wiping everything.
    const dataRows = await prisma.payrollData.findMany({
      where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod },
      select: { payrollId: true }
    })
    const payrollIds = Array.from(new Set(dataRows.map((r) => r.payrollId).filter((id): id is string => Boolean(id))))

    await prisma.$transaction([
      // source: 'GENERATED' is a defense-in-depth guard — never delete a
      // Payroll row the manual upload path created, even if a payrollId
      // somehow pointed at one.
      ...(payrollIds.length > 0
        ? [prisma.payroll.deleteMany({ where: { id: { in: payrollIds }, companyId: run.companyId, source: 'GENERATED' } })] // cascades to Payslip
        : []),
      prisma.payrollData.deleteMany({ where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod } }),
      prisma.payrollGenerationRun.deleteMany({ where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod } })
    ])

    return withCors(ApiResponse.success({ deleted: true, payPeriod: run.payPeriod }, `${run.payPeriod} deleted`), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
