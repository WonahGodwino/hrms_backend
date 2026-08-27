import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// Helper to unpack template record with fieldsSchema
function formatTemplate(template: any) {
  const schema = typeof template.fieldsSchema === 'object' && template.fieldsSchema !== null
    ? template.fieldsSchema
    : {}

  return {
    id: template.id,
    companyId: template.companyId,
    name: template.name,
    description: schema.description ?? '',
    category: schema.category ?? 'General',
    authority: schema.authority ?? 'Internal Training Dept',
    status: schema.status ?? 'Active',
    validityDuration: schema.validityDuration ?? '1',
    validityUnit: schema.validityUnit ?? 'Years',
    expiryType: schema.expiryType ?? 'rolling',
    gracePeriod: schema.gracePeriod ?? '30',
    renewalRequired: schema.renewalRequired ?? true,
    autoRenew: schema.autoRenew ?? false,
    renewalConditions: schema.renewalConditions ?? ['upload document'],
    reminderSchedule: schema.reminderSchedule ?? ['30 days', '7 days'],
    documents: schema.documents ?? [{ id: '1', name: 'Certificate File', required: true }],
    assessmentRequired: schema.assessmentRequired ?? false,
    passingScore: schema.passingScore ?? '80',
    mandatoryRoles: schema.mandatoryRoles ?? [],
    departments: schema.departments ?? [],
    fieldsSchema: schema,
    usedCount: template._count?.types ?? 0,
    createdBy: template.createdBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
}

// GET /api/certification-templates
// Supports: search, status, category, page, limit
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const search    = searchParams.get('search')?.trim()
    const status    = searchParams.get('status')
    const category  = searchParams.get('category')
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit     = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

    const where: any = { companyId }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    const [total, templates] = await Promise.all([
      prisma.certificationTemplate.count({ where }),
      prisma.certificationTemplate.findMany({
        where,
        include: { _count: { select: { types: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const formatted = templates.map(formatTemplate).filter(t => {
      if (status && t.status.toLowerCase() !== status.toLowerCase()) return false
      if (category && t.category.toLowerCase() !== category.toLowerCase()) return false
      return true
    })

    return withCors(ApiResponse.success({ items: formatted, total, page, limit }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/certification-templates — Create template
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()

    const resolved = await resolveRequestCompanyId(user, body.companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved

    if (!body.name) {
      return withCors(ApiResponse.error('companyId and template name are required', 400), origin)
    }

    const fieldsSchema = body.fieldsSchema ?? {
      description: body.description ?? '',
      category: body.category ?? 'General',
      authority: body.authority ?? 'Internal Training Dept',
      status: body.status ?? 'Draft',
      validityDuration: body.validityDuration ?? '1',
      validityUnit: body.validityUnit ?? 'Years',
      expiryType: body.expiryType ?? 'rolling',
      gracePeriod: body.gracePeriod ?? '30',
      renewalRequired: body.renewalRequired ?? true,
      autoRenew: body.autoRenew ?? false,
      renewalConditions: body.renewalConditions ?? ['upload document'],
      reminderSchedule: body.reminderSchedule ?? ['30 days', '7 days'],
      documents: body.documents ?? [{ id: '1', name: 'Certificate File', required: true }],
      assessmentRequired: body.assessmentRequired ?? false,
      passingScore: body.passingScore ?? '80',
      mandatoryRoles: body.mandatoryRoles ?? [],
      departments: body.departments ?? [],
    }

    const template = await prisma.certificationTemplate.create({
      data: {
        companyId: cid,
        name: body.name,
        fieldsSchema,
        createdBy: user.userId,
      },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: cid,
        actorId: user.userId,
        action: 'TEMPLATE_CREATED',
        entityType: 'certification_template',
        entityId: template.id,
        metadata: { templateName: template.name },
      },
    })

    return withCors(ApiResponse.success(formatTemplate(template), 'Template created successfully', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
