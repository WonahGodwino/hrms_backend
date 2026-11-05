import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

type RiskAction = 'assign' | 'remediate' | 'dismiss' | 'restrict-access'

// POST /api/analytics/certifications/risk/[riskId]/[action]
// action: assign | remediate | dismiss | restrict-access
// Body: { source?, note?, companyId? }
// Applies a workflow action to a risk signal. The RiskItem row is located by
// id OR code so the UI can address either. `restrict-access` additionally
// records the affected departments/users on the risk row.
export async function POST(req: NextRequest, { params }: { params: { riskId: string; action: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const action = params.action as RiskAction
    if (!['assign', 'remediate', 'dismiss', 'restrict-access'].includes(action)) {
      return withCors(ApiResponse.error(`Unknown risk action: ${params.action}`, 400), origin)
    }

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const risk = await prisma.riskItem.findFirst({
      where: { companyId, OR: [{ id: params.riskId }, { code: params.riskId }] },
    })
    if (!risk) {
      return withCors(ApiResponse.error('Risk not found', 404), origin)
    }

    const now = new Date()

    let updated
    if (action === 'remediate' || action === 'dismiss') {
      updated = await prisma.riskItem.update({
        where: { id: risk.id },
        data: {
          status: 'Resolved',
          severity: action === 'dismiss' ? risk.severity : 'RESOLVED',
          primaryAction: action,
        },
      })
    } else if (action === 'assign') {
      updated = await prisma.riskItem.update({
        where: { id: risk.id },
        data: { primaryAction: 'assign' },
      })
    } else {
      const affected = {
        departments: Array.isArray(body.departments) ? body.departments : (risk.department ? [risk.department] : []),
        restrictedAt: now.toISOString(),
        source: body.source ?? 'risk-control-center',
      }
      updated = await prisma.riskItem.update({
        where: { id: risk.id },
        data: {
          primaryAction: 'restrict-access',
          affectedUsers: affected,
        },
      })
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: `RISK_${action.toUpperCase().replace('-', '_')}`,
        entityType: 'risk_item',
        entityId: risk.id,
        metadata: { code: risk.code, source: body.source ?? 'risk-control-center', note: body.note ?? null },
      },
    })

    return withCors(
      ApiResponse.success(
        { id: updated.id, code: updated.code, status: updated.status, action },
        `Risk ${action} applied successfully`,
      ),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
