import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { syncModuleAccess } from '@/app/lib/module-access'

// Pre-approved module options that can be created by SUPER_ADMIN
const AVAILABLE_MODULE_OPTIONS = [
  { key: 'CORE_SETUP', name: 'Core Setup', description: 'Company structure — departments, business units, designations, grade levels and staff records' },
  { key: 'RECRUITMENT', name: 'Recruitment', description: 'Job postings, applicant tracking, interviews and selection' },
  { key: 'ONBOARDING', name: 'Onboarding', description: 'New hire onboarding workflows, checklists and command centre' },
  { key: 'TASK_MANAGEMENT', name: 'Task Management', description: 'Task dashboard, assignment and tracking for HR and staff' },
  { key: 'ATTENDANCE', name: 'Attendance', description: 'Attendance tracking, daily, weekly and monthly reports' },
  { key: 'LEAVE', name: 'Leave Management', description: 'Leave applications, approvals, balances and policy management' },
  { key: 'PAYROLL', name: 'General Payroll', description: 'Standard payroll processing, payslips and salary schedules' },
  { key: 'TRAINING', name: 'Training & Certifications', description: 'Training programs, sessions, assessments and certification tracking' },
  { key: 'OFFBOARDING', name: 'Offboarding', description: 'Employee exit workflows, task management and offboarding records' },
  { key: 'PHED', name: 'PHED Payroll', description: 'Port Harcourt Electricity Distribution payroll engine' },
  { key: 'STAFF_LOANS_BENEFITS', name: 'Staff Loans & Benefits', description: 'Loan applications, benefit requests, policy configuration' },
]

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/super-admin/modules
// Returns all platform modules with options for adding new ones
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const existingModules = await (prisma as any).platformModule.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, key: true, name: true, description: true, createdAt: true },
    })

    const existingKeys = new Set(existingModules.map((m: any) => m.key))

    // Find available modules not yet created
    const availableOptions = AVAILABLE_MODULE_OPTIONS.filter(
      (opt) => !existingKeys.has(opt.key)
    )

    return withCors(ApiResponse.success({
      modules: existingModules,
      availableOptions,
      totalRegistered: existingModules.length,
    }, 'Platform modules fetched successfully'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/super-admin/modules
// Creates a new platform module and syncs company access rows
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { key, name, description } = await req.json()

    if (!key || !name) {
      return withCors(ApiResponse.error('key and name are required', 400), origin)
    }

    // Check if module with this key already exists
    const existing = await (prisma as any).platformModule.findUnique({
      where: { key },
    })

    if (existing) {
      return withCors(ApiResponse.error(`Module with key "${key}" already exists`, 409), origin)
    }

    // Create the module
    const newModule = await (prisma as any).platformModule.create({
      data: { key, name, description: description || '' },
    })

    // Create company_module_access rows for all active companies
    const { created } = await syncModuleAccess()

    return withCors(ApiResponse.success({
      module: newModule,
      accessRowsCreated: created,
    }, `Module "${name}" created successfully with ${created} company access rows`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// DELETE /api/super-admin/modules
// Deletes a platform module by key
export async function DELETE(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')

    if (!key) {
      return withCors(ApiResponse.error('key is required as query parameter', 400), origin)
    }

    const existing = await (prisma as any).platformModule.findUnique({
      where: { key },
    })

    if (!existing) {
      return withCors(ApiResponse.error(`Module with key "${key}" not found`, 404), origin)
    }

    // Check if any company has this module enabled
    const activeAccessCount = await (prisma as any).companyModuleAccess.count({
      where: { moduleId: existing.id, enabled: true },
    })

    if (activeAccessCount > 0) {
      return withCors(ApiResponse.error(
        `Cannot delete module "${existing.name}" — it is currently enabled for ${activeAccessCount} company(s). Please disable it first.`,
        409
      ), origin)
    }

    // Delete all company_module_access rows for this module
    await (prisma as any).companyModuleAccess.deleteMany({
      where: { moduleId: existing.id },
    })

    // Delete the module
    await (prisma as any).platformModule.delete({
      where: { key },
    })

    return withCors(ApiResponse.success({
      key,
      name: existing.name,
    }, `Module "${existing.name}" deleted successfully`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}