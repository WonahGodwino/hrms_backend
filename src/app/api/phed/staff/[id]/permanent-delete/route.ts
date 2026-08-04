import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// DELETE /api/phed/staff/[id]/permanent-delete
// Generates a CSV history of the staff record + payroll data,
// then permanently deletes the staff and all related records.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    // ── Fetch staff base record (no relations to avoid missing-table errors) ──
    const staff = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id },
      select: {
        id: true, companyId: true, staffId: true, firstName: true, lastName: true,
        email: true, phone: true, category: true, department: true, unit: true,
        bankName: true, accountNumber: true, accountName: true,
        rsaPin: true, pfaName: true, tin: true, pensionNumber: true,
        basicSalary: true, housingAllowance: true, transportAllowance: true,
        furnitureAllowance: true, mealSubsidy: true, utilityAllowance: true,
        leaveAllowance: true, otherAllowances: true,
        domesticAllowance: true, hazardAllowance: true, electricityAllowance: true,
        discoveryAllowance: true, carSubsidy: true, entertainmentAllowance: true,
        dataAllowance: true, nightAllowance: true, arrears: true,
        annualRent: true, hasLifeAssurance: true, lifeAssuranceAmount: true,
        voluntaryPension: true, insurance: true,
        isActive: true, createdBy: true, createdAt: true, updatedAt: true,
      },
    })

    if (!staff) return withCors(ApiResponse.notFound('Staff not found'), origin)

    // ── Fetch relations individually (each wrapped in try-catch for missing tables) ──
    const safeGet = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn() } catch { return fallback }
    }

    const [grade, region, feeder, payPoint, unions, cooperatives, payrolls, advances, validations, overtimes, deductionLiabs] = await Promise.all([
      safeGet(() => (prisma as any).phedGrade.findUnique({ where: { id: staff.gradeId }, select: { code: true, name: true } }), null),
      safeGet(() => (prisma as any).phedRegion.findUnique({ where: { id: staff.regionId }, select: { name: true } }), null),
      safeGet(() => (prisma as any).phedFeeder.findUnique({ where: { id: staff.feederId }, select: { name: true } }), null),
      safeGet(() => (prisma as any).phedPayPoint.findUnique({ where: { id: staff.payPointId }, select: { name: true } }), null),
      safeGet(() => (prisma as any).phedStaffUnion.findMany({ where: { staffId: params.id }, select: { assignedAt: true, union: { select: { name: true } } } }), []),
      safeGet(() => (prisma as any).phedStaffCooperative.findMany({ where: { staffId: params.id }, select: { contributionAmount: true, loanAmount: true, totalAmount: true, assignedAt: true, cooperative: { select: { name: true } } } }), []),
      safeGet(() => (prisma as any).phedComputedPayroll.findMany({ where: { staffId: params.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { payPeriodId: true, paymentStatus: true, grossSalary: true, netSalary: true, monthlyPAYE: true, pensionEmployee: true, createdAt: true } }), []),
      safeGet(() => (prisma as any).phedStaffPeriodAdvance.findMany({ where: { staffId: params.id }, select: { cashAdvanced: true, loan: true, domesticLoan: true } }), []),
      safeGet(() => (prisma as any).phedValidation.findMany({ where: { staffId: params.id }, select: { status: true, reason: true } }), []),
      safeGet(() => (prisma as any).phedOvertimeEntry.findMany({ where: { staffId: params.id }, select: { overtimeHours: true, computedAmount: true } }), []),
      safeGet(() => (prisma as any).phedStaffDeductionLiability.findMany({ where: { staffId: params.id }, select: { amount: true, deductionLiability: { select: { name: true } } } }), []),
    ])

    // Attach relations to staff object
    staff.grade = grade; staff.region = region; staff.feeder = feeder; staff.payPoint = payPoint
    staff.unions = unions; staff.cooperatives = cooperatives
    staff.computedPayrolls = payrolls; staff.periodAdvances = advances
    staff.validations = validations; staff.overtimeEntries = overtimes
    staff.deductionLiabilities = deductionLiabs

    // ── Fetch login account ─────────────────────────────────
    const staffAccount = await prisma.staffRecord.findFirst({
      where: { staffId: staff.staffId, companyId: staff.companyId },
      select: { email: true, role: true, isActive: true, createdAt: true },
    })

    // ── Build CSV history ───────────────────────────────────
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines: string[] = []

    // Section 1: Personal & employment info
    lines.push('=== STAFF PROFILE ===')
    lines.push('Field,Value')
    lines.push(`Staff ID,${esc(staff.staffId)}`)
    lines.push(`Name,${esc(`${staff.firstName} ${staff.lastName}`)}`)
    lines.push(`Email,${esc(staff.email)}`)
    lines.push(`Phone,${esc(staff.phone)}`)
    lines.push(`Category,${esc(staff.category)}`)
    lines.push(`Job Title,${esc(staff.jobTitle)}`)
    lines.push(`Level,${esc(staff.level)}`)
    lines.push(`Department,${esc(staff.department)}`)
    lines.push(`Unit,${esc(staff.unit)}`)
    lines.push(`Grade,${esc(staff.grade?.code)}`)
    lines.push(`Region,${esc(staff.region?.name)}`)
    lines.push(`Feeder,${esc(staff.feeder?.name)}`)
    lines.push(`Pay Point,${esc(staff.payPoint?.name)}`)
    lines.push(`Resumption Date,${esc(staff.resumptionDate)}`)
    lines.push(`Created At,${esc(staff.createdAt)}`)
    lines.push(`Call Center,${esc(staff.callCenter)}`)
    lines.push('')

    // Section 2: Banking & statutory
    lines.push('=== BANKING & STATUTORY ===')
    lines.push('Field,Value')
    lines.push(`Bank,${esc(staff.bankName)}`)
    lines.push(`Account Number,${esc(staff.accountNumber)}`)
    lines.push(`Account Name,${esc(staff.accountName)}`)
    lines.push(`RSA PIN,${esc(staff.rsaPin)}`)
    lines.push(`PFA,${esc(staff.pfaName)}`)
    lines.push(`Pension Number,${esc(staff.pensionNumber)}`)
    lines.push(`TIN,${esc(staff.tin)}`)
    lines.push(`NHF Number,${esc(staff.nhfNumber)}`)
    lines.push(`Has Life Assurance,${esc(staff.hasLifeAssurance ? 'YES' : 'NO')}`)
    lines.push(`Life Assurance Amount,${esc(staff.lifeAssuranceAmount)}`)
    lines.push('')

    // Section 3: Salary & allowances
    lines.push('=== SALARY & ALLOWANCES ===')
    lines.push('Field,Value (₦)')
    lines.push(`Basic Salary,${esc(staff.basicSalary)}`)
    lines.push(`Housing Allowance,${esc(staff.housingAllowance)}`)
    lines.push(`Transport Allowance,${esc(staff.transportAllowance)}`)
    lines.push(`Furniture Allowance,${esc(staff.furnitureAllowance)}`)
    lines.push(`Domestic Allowance,${esc(staff.domesticAllowance)}`)
    lines.push(`Meal Subsidy,${esc(staff.mealSubsidy)}`)
    lines.push(`Hazard Allowance,${esc(staff.hazardAllowance)}`)
    lines.push(`Leave Allowance,${esc(staff.leaveAllowance)}`)
    lines.push(`Electricity Allowance,${esc(staff.electricityAllowance)}`)
    lines.push(`Utility Allowance,${esc(staff.utilityAllowance)}`)
    lines.push(`Discovery Allowance,${esc(staff.discoveryAllowance)}`)
    lines.push(`Car Subsidy,${esc(staff.carSubsidy)}`)
    lines.push(`Entertainment Allowance,${esc(staff.entertainmentAllowance)}`)
    lines.push(`Data Allowance,${esc(staff.dataAllowance)}`)
    lines.push(`Night Allowance,${esc(staff.nightAllowance)}`)
    lines.push(`Other Allowances,${esc(staff.otherAllowances)}`)
    lines.push(`Arrears,${esc(staff.arrears)}`)
    lines.push(`Annual Rent,${esc(staff.annualRent)}`)
    lines.push('')

    // Section 4: Deductions
    lines.push('=== DEDUCTIONS ===')
    lines.push('Field,Value (₦)')
    lines.push(`Voluntary Pension,${esc(staff.voluntaryPension)}`)
    lines.push(`Insurance,${esc(staff.insurance)}`)
    lines.push(`Cash Advanced,${esc(staff.cashAdvanced)}`)
    lines.push(`Loan,${esc(staff.loan)}`)
    lines.push(`Domestic Loan,${esc(staff.domesticLoan)}`)
    lines.push('')

    // Section 5: Union & Cooperative memberships
    if (staff.unions?.length > 0) {
      lines.push('=== UNION MEMBERSHIPS ===')
      lines.push('Union,Assigned At')
      for (const su of staff.unions) {
        lines.push(`${esc(su.union?.name)},${esc(su.assignedAt)}`)
      }
      lines.push('')
    }

    if (staff.cooperatives?.length > 0) {
      lines.push('=== COOPERATIVE MEMBERSHIPS ===')
      lines.push('Cooperative,Contribution,Loan,Total,Assigned At')
      for (const sc of staff.cooperatives) {
        lines.push(`${esc(sc.cooperative?.name)},${esc(sc.contributionAmount)},${esc(sc.loanAmount)},${esc(sc.totalAmount)},${esc(sc.assignedAt)}`)
      }
      lines.push('')
    }

    // Section 6: Payroll history
    if (staff.computedPayrolls?.length > 0) {
      lines.push('=== PAYROLL HISTORY (last 50) ===')
      lines.push('Period,Status,Gross Pay,Net Pay,PAYE Tax,Pension,Date')
      for (const cp of staff.computedPayrolls) {
        lines.push(`${esc(cp.payPeriodId)},${esc(cp.paymentStatus)},${esc(cp.grossSalary)},${esc(cp.netSalary)},${esc(cp.monthlyPAYE)},${esc(cp.pensionEmployee)},${esc(cp.createdAt)}`)
      }
      lines.push('')
    }

    // Section 8: Login account
    if (staffAccount) {
      lines.push('=== LOGIN ACCOUNT ===')
      lines.push('Field,Value')
      lines.push(`Email,${esc(staffAccount.email)}`)
      lines.push(`Role,${esc(staffAccount.role)}`)
      lines.push(`Active,${esc(staffAccount.isActive)}`)
      lines.push(`Created,${esc(staffAccount.createdAt)}`)
      lines.push('')
    }

    lines.push(`=== DELETED ON: ${new Date().toISOString()} ===`)

    const csvContent = lines.join('\n')
    const safeName = `${staff.staffId}_${staff.firstName}_${staff.lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    const fileName = `staff-history-${safeName}.csv`

    // ── Delete related records in dependency order ──────────
    // Prisma cascade handles most, but we do explicit cleanup for clarity
    await (prisma as any).phedStaffCooperative.deleteMany({ where: { staffId: params.id } }).catch(() => {})
    await (prisma as any).phedStaffUnion.deleteMany({ where: { staffId: params.id } }).catch(() => {})
    await (prisma as any).phedValidation.deleteMany({ where: { staffId: params.id } }).catch(() => {})
    await (prisma as any).phedOvertimeEntry.deleteMany({ where: { staffId: params.id } }).catch(() => {})
    await (prisma as any).phedStaffPeriodAdvance.deleteMany({ where: { staffId: params.id } }).catch(() => {})
    await (prisma as any).phedStaffDeductionLiability.deleteMany({ where: { staffId: params.id } }).catch(() => {})
    await (prisma as any).phedComputedPayroll.deleteMany({ where: { staffId: params.id } }).catch(() => {})

    // Delete login account
    await prisma.staffRecord.deleteMany({
      where: { staffId: staff.staffId, companyId: staff.companyId },
    }).catch(() => {})

    // Finally delete the PHED staff record itself
    await (prisma as any).phedStaff.delete({ where: { id: params.id } })

    // ── Return CSV for download ─────────────────────────────
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Expose-Headers': 'Content-Disposition,X-Delete-Message',
        'X-Delete-Message': encodeURIComponent(`Staff ${staff.staffId} permanently deleted. History saved as ${fileName}`),
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
