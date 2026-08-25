import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { canManagePhedRolesForCompany, PHED_ACCESS_ROLES, requirePhedRoleManagementAccess } from '@/app/lib/phed/access-role'
import { notifyPhedAccessRoleChange } from '@/app/lib/phed/access-role-notifications'
import { seedDefaultPhedRoleAccessGrants } from '@/app/lib/phed/page-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLE_LABELS: Record<string, string> = {
  MANAGER_COMP_BENEFITS: 'Manager, Compensation & Benefits',
  TAX_AUDIT: 'Tax Audit',
  HEAD_INTERNAL_AUDIT: 'Head, Internal Audit',
  CHIEF_PEOPLE_OFFICER: 'Chief People Officer',
  CHIEF_FINANCE_OFFICER: 'Chief Finance Officer',
  MD_CEO: 'MD/CEO',
  TREASURY_TEAM: 'Treasury Team',
  FINANCIAL_REPORTING_TEAM: 'Financial Reporting Team',
  TAX_TEAM: 'Tax Team',
}

function resolveCompanyId(user: { role: string; companyId?: string }, requestedCompanyId?: string | null): string | null {
  if (user.role === 'SUPER_ADMIN') return requestedCompanyId || user.companyId || null
  return requestedCompanyId || user.companyId || null
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedRoleManagementAccess(token)
    const companyId = resolveCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (!companyId || !await canManagePhedRolesForCompany(user, companyId)) {
      return withCors(ApiResponse.forbidden('You are not assigned to manage PHED roles for this company'), origin)
    }

    const assignments = await prisma.phedStaffAccessRole.findMany({
      where: { companyId },
      include: {
        staffRecord: {
          select: { id: true, staffId: true, firstName: true, lastName: true, email: true, position: true, department: true, isActive: true },
        },
      },
      orderBy: [{ accessRole: 'asc' }, { createdAt: 'asc' }],
    })

    // Audit history depends on the phed_access_role_changes table
    // Return an empty list when the table has not yet been
    // provisioned — the page still loads with role definitions and assignments.
    let history: any[] = []
    try {
      history = await prisma.phedAccessRoleChange.findMany({
        where: { companyId },
        include: { staffRecord: { select: { firstName: true, lastName: true, staffId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    } catch {
      // Table not yet present — the migration hasn't been applied.
    }

    return withCors(ApiResponse.success({
      // Manager, Compensation & Benefits is not assignable — the HR/ADMIN/
      // SUPER_ADMIN who uploads the payroll for a pay period fills that
      // first-approval desk for that period.
      roles: PHED_ACCESS_ROLES
        .filter(value => value !== 'MANAGER_COMP_BENEFITS')
        .map(value => ({ value, label: ROLE_LABELS[value] })),
      assignments,
      history,
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedRoleManagementAccess(token)
    const body = await req.json()
    const companyId = resolveCompanyId(user, body?.companyId)
    const staffRecordId = typeof body?.staffRecordId === 'string' ? body.staffRecordId : ''
    const accessRole = typeof body?.accessRole === 'string' ? body.accessRole : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    if (!companyId || !await canManagePhedRolesForCompany(user, companyId)) {
      return withCors(ApiResponse.forbidden('You are not assigned to manage PHED roles for this company'), origin)
    }
    if (!staffRecordId || !PHED_ACCESS_ROLES.includes(accessRole as any)) {
      return withCors(ApiResponse.error('A valid staff member and PHED access role are required', 400), origin)
    }
    if (accessRole === 'MANAGER_COMP_BENEFITS') {
      return withCors(ApiResponse.error(
        'Manager, Compensation & Benefits cannot be assigned — the HR/ADMIN/SUPER_ADMIN who uploads the payroll for a pay period acts as the first approver for that period.',
        400,
      ), origin)
    }
    if (!reason || reason.length > 1000) {
      return withCors(ApiResponse.error('A role-change reason between 1 and 1000 characters is required', 400), origin)
    }

    const [target, actor] = await Promise.all([
      prisma.staffRecord.findFirst({
        where: { id: staffRecordId, companyId, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } }),
    ])
    if (!target) return withCors(ApiResponse.notFound('Active staff member not found in this company'), origin)

    await seedDefaultPhedRoleAccessGrants(companyId)

    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown'
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.phedStaffAccessRole.findUnique({ where: { staffRecordId } })
      const action: 'ASSIGNED' | 'CHANGED' | null = existing
        ? (existing.accessRole === accessRole ? null : 'CHANGED')
        : 'ASSIGNED'
      if (!action) return { unchanged: true as const, assignment: existing, action: null, previousRole: existing!.accessRole }

      const assignment = await tx.phedStaffAccessRole.upsert({
        where: { staffRecordId },
        update: { accessRole: accessRole as any, companyId },
        create: { companyId, staffRecordId, accessRole: accessRole as any },
      })
      await tx.phedAccessRoleChange.create({
        data: {
          companyId,
          staffRecordId,
          action,
          previousRole: existing?.accessRole ?? null,
          newRole: accessRole as any,
          reason,
          changedById: user.userId,
          changedByName: actorName,
          changedByRole: user.phedAccessRole ?? user.role,
        },
      })
      return { unchanged: false as const, assignment, action, previousRole: existing?.accessRole ?? null }
    })

    if (result.unchanged) {
      return withCors(ApiResponse.success(result.assignment, 'This staff member already holds that PHED role'), origin)
    }

    notifyPhedAccessRoleChange({
      companyId,
      targetName: `${target.firstName} ${target.lastName}`,
      action: result.action!,
      previousRole: result.previousRole,
      newRole: accessRole,
      reason,
      changedByName: actorName,
    }).catch(error => console.error('PHED access-role change notification failed:', error))

    return withCors(ApiResponse.success(result.assignment, result.action === 'ASSIGNED' ? 'PHED role assigned' : 'PHED role updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
