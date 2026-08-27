import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/expiry-rules/options
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const [trainings, certs, departments, roles] = await Promise.all([
      prisma.trainingProgram.findMany({
        where: { companyId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, programName: true },
      }),
      prisma.certificationType.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.department.findMany({
        where: { companyId, status: 'Active' },
        select: { name: true },
      }),
      prisma.designation.findMany({
        where: { companyId, status: 'Active' },
        select: { title: true },
      }),
    ])

    return withCors(
      ApiResponse.success({
        trainings: trainings.map((t) => ({ id: t.id, name: t.programName })),
        certifications: certs.map((c) => ({ id: c.id, name: c.name })),
        scopes: ['All Employees', 'By Department', 'By Role', 'By Location'],
        departments: departments.map((d) => d.name),
        roles: roles.map((r) => r.title),
        locations: ['Lagos', 'Abuja', 'Remote', 'Port Harcourt'],
        statusHandlingOptions: [
          { label: 'Mark as non-compliant after grace period', value: 'mark_non_compliant' },
          { label: 'Escalate to manager', value: 'escalate_manager' },
          { label: 'Auto-reassign training', value: 'auto_reassign' },
        ],
        notificationOptions: [
          { label: '30 days before expiry', value: 30 },
          { label: '14 days before expiry', value: 14 },
          { label: '7 days before expiry', value: 7 },
          { label: 'On expiry date', value: 'on_expiry' },
        ],
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
