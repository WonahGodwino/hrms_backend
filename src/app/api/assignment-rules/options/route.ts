import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/assignment-rules/options?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const [departments, roles, activePrograms] = await Promise.all([
      prisma.department.findMany({
        where: { companyId, status: 'Active' },
        select: { name: true },
      }),
      prisma.designation.findMany({
        where: { companyId, status: 'Active' },
        select: { title: true },
      }),
      prisma.trainingProgram.findMany({
        where: { companyId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, programName: true },
      }),
    ])

    const deptValues = departments.map((d) => d.name)
    const roleValues = roles.map((r) => r.title)

    const eventSources = [
      { label: 'Employee Profile Change', value: 'employee_profile_change' },
      { label: 'Training Status Change', value: 'training_status_change' },
      { label: 'Certification Event', value: 'certification_event' },
      { label: 'Scheduled Check', value: 'scheduled_check' },
    ]

    const actionsBySource = {
      employee_profile_change: [
        { label: 'New Hire Onboarded', value: 'new_hire_onboarded' },
        { label: 'Role Changed', value: 'role_changed' },
        { label: 'Department Changed', value: 'department_changed' },
        { label: 'Location Changed', value: 'location_changed' },
      ],
      training_status_change: [
        { label: 'Training Not Started', value: 'training_not_started' },
        { label: 'Training Overdue', value: 'training_overdue' },
        { label: 'Assessment Failed', value: 'assessment_failed' },
      ],
      certification_event: [
        { label: 'Certification Expiring Soon', value: 'certification_expiring_soon' },
        { label: 'Certification Expired', value: 'certification_expired' },
      ],
    }

    const conditionFields = [
      {
        label: 'Department',
        value: 'department',
        valueType: 'select',
        values: deptValues.length ? deptValues : ['Engineering', 'Finance', 'HR', 'Sales'],
      },
      {
        label: 'Role',
        value: 'role',
        valueType: 'select',
        values: roleValues.length ? roleValues : ['Manager', 'Staff', 'Engineer'],
      },
      {
        label: 'Location',
        value: 'location',
        valueType: 'select',
        values: ['Lagos', 'Abuja', 'Remote', 'Port Harcourt'],
      },
      {
        label: 'Hire Date',
        value: 'hireDate',
        valueType: 'number',
      },
    ]

    const operators = [
      { label: 'is', value: 'equals' },
      { label: 'is not', value: 'not_equals' },
      { label: 'contains', value: 'contains' },
      { label: 'is within days', value: 'within_days' },
    ]

    const executionActions = [{ label: 'Assign Training Course', value: 'assign_training' }]

    const executionTimings = [
      { label: 'Immediately', value: 'immediate' },
      { label: 'After delay', value: 'delayed' },
    ]

    const trainingPrograms = activePrograms.map((p) => ({
      id: p.id,
      name: p.programName,
    }))

    return withCors(
      ApiResponse.success({
        eventSources,
        actionsBySource,
        conditionFields,
        operators,
        executionActions,
        executionTimings,
        trainingPrograms,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
