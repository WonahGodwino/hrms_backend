// GET  /api/recruitment/offers/approval-workflow?companyId= → the company's
//      configured offer-approval workflow + the eligible approvers to pick from.
// PUT  /api/recruitment/offers/approval-workflow → save the workflow (set once,
//      auto-applied to every new offer). Validates each approver is an eligible
//      HR/ADMIN/SUPER_ADMIN member of the company.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { normalizeWorkflow } from '@/app/lib/offers/approval-workflow'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

async function eligibleApprovers(companyId: string) {
  const memberships = await prisma.userCompany.findMany({
    where: { companyId, role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] } },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, position: true, isActive: true } } },
  })
  return memberships
    .filter((m) => m.user && m.user.isActive !== false)
    .map((m) => ({
      userId: m.user.id,
      name: `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || m.user.email || 'User',
      role: m.role,
      email: m.user.email,
    }))
    .filter((a, i, arr) => arr.findIndex((x) => x.userId === a.userId) === i)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const company = await (prisma as any).company.findUnique({
      where: { id: companyId },
      select: { offerApprovalWorkflow: true },
    })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    return withCors(ApiResponse.success({
      workflow: normalizeWorkflow(company.offerApprovalWorkflow),
      approvers: await eligibleApprovers(companyId),
    }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const body = await request.json().catch(() => ({}))

    // Clearing the workflow (null / empty steps) is allowed.
    if (body.workflow === null || (Array.isArray(body?.workflow?.steps) && body.workflow.steps.length === 0)) {
      await (prisma as any).company.update({ where: { id: companyId }, data: { offerApprovalWorkflow: null } })
      return withCors(ApiResponse.success({ workflow: null }, 'Approval workflow cleared. Offers will have approvers assigned ad-hoc.'), origin)
    }

    const normalized = normalizeWorkflow(body.workflow)
    if (!normalized) return withCors(ApiResponse.error('Provide at least one approval step.', 400), origin)

    // Every approver must be an eligible member of this company.
    const eligible = new Set((await eligibleApprovers(companyId)).map((a) => a.userId))
    const bad = normalized.steps.find((s) => !eligible.has(s.approverId))
    if (bad) {
      return withCors(ApiResponse.error(`"${bad.approverName || bad.approverId}" is not an eligible approver (needs an HR, ADMIN or SUPER_ADMIN role in this company).`, 400), origin)
    }

    await (prisma as any).company.update({
      where: { id: companyId },
      data: { offerApprovalWorkflow: normalized as any },
    })
    return withCors(ApiResponse.success({ workflow: normalized }, `Approval workflow saved — ${normalized.steps.length} step(s). It will apply to every new offer.`), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
