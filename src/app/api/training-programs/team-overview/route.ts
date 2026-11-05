import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training-programs/team-overview
// Training + certification rollup for the caller's own direct reports
// (StaffRecord.managerId = the caller) — deliberately NOT a company-wide
// view, since HR/Admin already have that via the Training Dashboard and
// Certification Records pages. This is the "my team" counterpart to those,
// for whichever HR/Admin/Super Admin user happens to have people reporting
// to them (there is no separate MANAGER role in this system — see
// StaffRecord.managerId/directReports, and how leaves/[id]/manager-approve
// already scopes the same way).
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const directReports = await prisma.staffRecord.findMany({
      where: { companyId, managerId: user.userId, isActive: true },
      select: { id: true, staffId: true, firstName: true, lastName: true, email: true, department: true, position: true },
      orderBy: { firstName: 'asc' },
    })

    if (directReports.length === 0) {
      return withCors(ApiResponse.success({ team: [], kpis: { teamSize: 0, avgCompletionPct: 0, overdueCount: 0, certExpiringSoon: 0, certExpired: 0 } }), origin)
    }

    const employeeIds = directReports.map((s) => s.id)
    const now = new Date()

    const [progressRows, certRows] = await Promise.all([
      prisma.participantProgress.findMany({
        where: { companyId, employeeId: { in: employeeIds } },
        select: { employeeId: true, trainingStatus: true, progressPct: true, dueDate: true, trainingProgram: { select: { programName: true } } },
      }),
      prisma.certificationRecord.findMany({
        where: { companyId, employeeId: { in: employeeIds }, status: { not: 'Archived' } },
        select: { id: true, employeeId: true, status: true, expiryDate: true, certificationType: { select: { name: true } } },
      }),
    ])

    const team = directReports.map((staff) => {
      const myProgress = progressRows.filter((p) => p.employeeId === staff.id)
      const myCerts = certRows.filter((c) => c.employeeId === staff.id)
      const overdue = myProgress.filter((p) => p.dueDate && p.dueDate < now && p.trainingStatus !== 'COMPLETED')
      return {
        staffId: staff.id,
        staffNumber: staff.staffId,
        name: `${staff.firstName} ${staff.lastName}`,
        email: staff.email,
        department: staff.department,
        position: staff.position,
        training: {
          assigned: myProgress.length,
          completed: myProgress.filter((p) => p.trainingStatus === 'COMPLETED').length,
          inProgress: myProgress.filter((p) => p.trainingStatus === 'IN PROGRESS').length,
          overdue: overdue.length,
          avgProgressPct: myProgress.length ? Math.round(myProgress.reduce((sum, p) => sum + p.progressPct, 0) / myProgress.length) : 0,
          overdueProgramNames: overdue.map((p) => p.trainingProgram.programName),
        },
        certifications: {
          total: myCerts.length,
          valid: myCerts.filter((c) => c.status === 'Valid').length,
          expiringSoon: myCerts.filter((c) => c.status === 'Expiring Soon').length,
          expired: myCerts.filter((c) => c.status === 'Expired').length,
          atRisk: myCerts
            .filter((c) => c.status === 'Expiring Soon' || c.status === 'Expired')
            .map((c) => ({ id: c.id, name: c.certificationType.name, status: c.status, expiryDate: c.expiryDate })),
        },
      }
    })

    const kpis = {
      teamSize: team.length,
      avgCompletionPct: Math.round(team.reduce((sum, t) => sum + t.training.avgProgressPct, 0) / team.length),
      overdueCount: team.reduce((sum, t) => sum + t.training.overdue, 0),
      certExpiringSoon: team.reduce((sum, t) => sum + t.certifications.expiringSoon, 0),
      certExpired: team.reduce((sum, t) => sum + t.certifications.expired, 0),
    }

    return withCors(ApiResponse.success({ team, kpis }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
