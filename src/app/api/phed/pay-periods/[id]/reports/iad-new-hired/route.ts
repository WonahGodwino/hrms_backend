import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { exportReportResponse, IAD_NEW_HIRED_COLS } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

// GET /api/phed/pay-periods/:id/reports/iad-new-hired — IAD Page, New Hired
// tab (PRD 13.3). Staff newly onboarded into payroll this period, with
// starting salary details. Cross-references Recruitment Onboarding
// (Module 3.3) on a best-effort basis via the shared email — no FK exists
// between PhedStaff and StaffRecord/Onboarding, so a missing match is
// expected and not an error.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'IAD_NEW_HIRED')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { companyId: true, periodName: true, year: true, month: true, company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    // New hires = staff present in this period's computed payroll but absent
    // from ALL earlier periods' computed payroll — identical to the IAD summary
    // workbook classification, so this tab and the workbook always agree.
    const currentPayrolls = await prisma.phedComputedPayroll.findMany({
      where:   { payPeriodId: params.id },
      select:  { staffId: true, staffIdCode: true, staffName: true, category: true, gradeName: true, department: true, basicSalary: true },
      orderBy: { staffIdCode: 'asc' },
    })

    const prevPeriods = await prisma.phedPayPeriod.findMany({
      where:  { companyId: period.companyId, id: { not: params.id } },
      select: { id: true },
    })
    const prevStaffIds = new Set<string>()
    if (prevPeriods.length > 0) {
      const prevPayrolls = await prisma.phedComputedPayroll.findMany({
        where:  { payPeriodId: { in: prevPeriods.map((p: any) => p.id) } },
        select: { staffId: true },
      })
      prevPayrolls.forEach((p: any) => prevStaffIds.add(p.staffId))
    }

    const newHirePayrolls = currentPayrolls.filter((p: any) => !prevStaffIds.has(p.staffId))

    const staffRecords = newHirePayrolls.length > 0
      ? await prisma.phedStaff.findMany({
          where:   { id: { in: newHirePayrolls.map((p: any) => p.staffId) } },
          include: { grade: true },
        })
      : []
    const staffById = new Map(staffRecords.map((s: any) => [s.id, s]))

    const rows: any[] = []
    const CONCURRENCY = 10
    for (let start = 0; start < newHirePayrolls.length; start += CONCURRENCY) {
      const chunk = newHirePayrolls.slice(start, start + CONCURRENCY)
      rows.push(...(await Promise.all(
        chunk.map(async (payroll: any) => {
          const staff = staffById.get(payroll.staffId)
          const startingBasicSalary = staff?.basicSalary != null
            ? toNum(staff.basicSalary)
            : (staff?.grade?.defaultBasicSalary != null ? toNum(staff.grade.defaultBasicSalary) : toNum(payroll.basicSalary))

          // Best-effort: not every PhedStaff has a matching StaffRecord/Onboarding
          // (e.g. seeded test data, or staff added before recruitment ran).
          const staffRecord = staff?.email
            ? await prisma.staffRecord.findUnique({
                where: { email_companyId: { email: staff.email, companyId: period.companyId } },
                select: { id: true },
              })
            : null
          const onboarding = staffRecord
            ? await prisma.onboarding.findFirst({
                where: { staffRecordId: staffRecord.id },
                select: { startDate: true, status: true },
              })
            : null

          return {
            staffName: staff ? `${staff.firstName} ${staff.lastName}` : (payroll.staffName ?? ''),
            staffIdCode: payroll.staffIdCode ?? staff?.staffId ?? '',
            department: staff?.department ?? payroll.department ?? null,
            category: payroll.category ?? staff?.category ?? 'REGULAR',
            gradeName: staff?.grade?.name ?? payroll.gradeName ?? null,
            startingBasicSalary,
            hireDate: staff?.createdAt ?? null,
            onboardingMatched: !!onboarding,
            onboardingStartDate: onboarding?.startDate ?? null,
            onboardingStatus: onboarding?.status ?? null,
          }
        })
      )))
    }

    const format = new URL(req.url).searchParams.get('format') ?? 'json'
    if (format === 'json') return withCors(ApiResponse.success(rows), origin)

    const exportRows = rows.map((r: any, idx: number) => ({
      ...r,
      sn: idx + 1,
      hireDate: r.hireDate ? new Date(r.hireDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
    }))
    const exp = await exportReportResponse(format, 'IAD New Hired', period.periodName ?? 'Unknown', IAD_NEW_HIRED_COLS, exportRows, period.company?.companyName ?? '', origin, 'iad-new-hired')
    if (exp) return exp
    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
