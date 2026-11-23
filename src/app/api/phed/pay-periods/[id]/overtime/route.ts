import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { computeOvertimeEarnings } from '@/app/lib/phed/payroll-processor'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { getPayPeriodFreezeState } from '@/app/lib/phed/pay-period-lock'
import { findAccessiblePayPeriod } from '@/app/lib/phed/pay-period-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    if (!(await findAccessiblePayPeriod(user, params.id)))
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    const [entries, salaryRecords] = await Promise.all([
      prisma.phedOvertimeEntry.findMany({
        where:   { payPeriodId: params.id },
        include: { staff: { select: { id: true, staffId: true, firstName: true, lastName: true, department: true } } },
        orderBy: { staff: { lastName: 'asc' } },
      }),
      // Salary inputs stored by upload-template (used to derive gross for OT calc)
      prisma.phedComputedPayroll.findMany({
        where:  { payPeriodId: params.id },
        select: {
          staffId: true,
          basicSalary: true, housingAllowance: true, transportAllowance: true,
          furnitureAllowance: true, mealSubsidy: true, utilityAllowance: true,
          leaveAllowance: true, domesticAllowance: true,
          hazardAllowance: true, electricityAllowance: true, discoveryAllowance: true,
          carSubsidy: true, entertainmentAllowance: true, dataAllowance: true,
          nightAllowance: true, arrears: true, otherAllowances: true,
        },
      }),
    ])

    const salaryMap = new Map<string, any>(salaryRecords.map((s: any) => [s.staffId, s]))

    const enriched = entries.map((entry: any) => {
      const hours = Number(entry.overtimeHours ?? 0)
      let computedAmount = Number(entry.computedAmount ?? 0)

      // If stored amount is 0 but hours exist, derive from available salary data
      if (computedAmount === 0 && hours > 0) {
        const sl = salaryMap.get(entry.staffId)
        if (sl) {
          const n = (f: string) => Number(sl[f] ?? 0)
          const grossBeforeOT =
            n('basicSalary') + n('housingAllowance') + n('transportAllowance') +
            n('furnitureAllowance') + n('mealSubsidy') +
            n('leaveAllowance') + n('domesticAllowance') +
            n('hazardAllowance') + n('electricityAllowance') + n('discoveryAllowance') +
            n('carSubsidy') + n('entertainmentAllowance') + n('dataAllowance') +
            n('nightAllowance') + n('arrears') + n('otherAllowances')
          computedAmount = computeOvertimeEarnings(hours, grossBeforeOT)
        }
      }

      return { ...entry, computedAmount: String(computedAmount) }
    })

    return withCors(ApiResponse.success(enriched), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await findAccessiblePayPeriod(user, params.id)
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    const freeze = await getPayPeriodFreezeState(params.id, period.status)
    if (freeze.frozen)
      return withCors(ApiResponse.error(freeze.reason || 'Pay period is locked', 409), origin)

    const { count } = await prisma.phedOvertimeEntry.deleteMany({ where: { payPeriodId: params.id } })
    return withCors(ApiResponse.success({ deleted: count }, 'Overtime entries cleared'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// PATCH /api/phed/pay-periods/:id/overtime — edit overtime hours for one or
// more entries after upload. Body: { entryId, overtimeHours } or
// { updates: [{ entryId, overtimeHours }] }. computedAmount is cleared so the
// next Compute re-derives the amount from the new hours.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await findAccessiblePayPeriod(user, params.id)
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    const freeze = await getPayPeriodFreezeState(params.id, period.status)
    if (freeze.frozen)
      return withCors(ApiResponse.error(freeze.reason || 'Pay period is locked', 409), origin)

    const body = await req.json().catch(() => ({}))
    const updates = Array.isArray(body?.updates) ? body.updates : (body?.entryId ? [body] : [])
    if (updates.length === 0)
      return withCors(ApiResponse.error('entryId and overtimeHours are required', 400), origin)

    let updated = 0
    const failed: string[] = []

    for (const u of updates) {
      const entryId = typeof u?.entryId === 'string' ? u.entryId : ''
      const hours = Number(u?.overtimeHours)
      if (!entryId || !Number.isFinite(hours) || hours < 0) {
        failed.push('Invalid overtime entry'); continue
      }

      const entry = await prisma.phedOvertimeEntry.findFirst({
        where: { id: entryId, payPeriodId: params.id },
      })
      if (!entry) { failed.push('Overtime entry not found for this period'); continue }

      await prisma.phedOvertimeEntry.update({
        where: { id: entryId },
        data: { overtimeHours: hours, computedAmount: null },
      })
      updated++
    }

    return withCors(
      ApiResponse.success({ updated, failed }, updated > 0 ? 'Overtime hours updated' : 'No overtime entries updated'),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

