import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

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

// GET /api/certification-templates/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const template = await prisma.certificationTemplate.findFirst({
      where: { id: params.id, companyId },
      include: { _count: { select: { types: true } } },
    })

    if (!template) return withCors(ApiResponse.error('Template not found', 404), origin)

    return withCors(ApiResponse.success(formatTemplate(template)), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// PUT / PATCH /api/certification-templates/[id]
async function handleUpdate(req: NextRequest, params: { id: string }) {
  const origin = req.headers.get('origin')
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

  const body = await req.json()

  const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
  if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
  const { companyId } = resolved

  const template = await prisma.certificationTemplate.findFirst({
    where: { id: params.id, companyId },
  })

  if (!template) return withCors(ApiResponse.error('Template not found', 404), origin)

  const existingSchema = (template.fieldsSchema as Record<string, any>) || {}

  const newSchema = {
    ...existingSchema,
    ...(body.fieldsSchema ?? {}),
    ...(body.description     !== undefined && { description: body.description }),
    ...(body.category        !== undefined && { category: body.category }),
    ...(body.authority       !== undefined && { authority: body.authority }),
    ...(body.status          !== undefined && { status: body.status }),
    ...(body.validityDuration !== undefined && { validityDuration: body.validityDuration }),
    ...(body.validityUnit    !== undefined && { validityUnit: body.validityUnit }),
    ...(body.expiryType      !== undefined && { expiryType: body.expiryType }),
    ...(body.gracePeriod     !== undefined && { gracePeriod: body.gracePeriod }),
    ...(body.renewalRequired !== undefined && { renewalRequired: body.renewalRequired }),
    ...(body.autoRenew       !== undefined && { autoRenew: body.autoRenew }),
    ...(body.renewalConditions !== undefined && { renewalConditions: body.renewalConditions }),
    ...(body.reminderSchedule !== undefined && { reminderSchedule: body.reminderSchedule }),
    ...(body.documents       !== undefined && { documents: body.documents }),
    ...(body.assessmentRequired !== undefined && { assessmentRequired: body.assessmentRequired }),
    ...(body.passingScore    !== undefined && { passingScore: body.passingScore }),
    ...(body.mandatoryRoles  !== undefined && { mandatoryRoles: body.mandatoryRoles }),
    ...(body.departments     !== undefined && { departments: body.departments }),
  }

  const updated = await prisma.certificationTemplate.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      fieldsSchema: newSchema,
      updatedAt: new Date(),
    },
    include: { _count: { select: { types: true } } },
  })

  await prisma.trainingAuditLog.create({
    data: {
      companyId,
      actorId: user.userId,
      action: 'TEMPLATE_UPDATED',
      entityType: 'certification_template',
      entityId: params.id,
      metadata: { templateName: updated.name },
    },
  })

  return withCors(ApiResponse.success(formatTemplate(updated), 'Template updated successfully'), origin)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try { return await handleUpdate(req, params) } catch (e) { return withCors(handleApiError(e), req.headers.get('origin')) }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try { return await handleUpdate(req, params) } catch (e) { return withCors(handleApiError(e), req.headers.get('origin')) }
}

// DELETE /api/certification-templates/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const template = await prisma.certificationTemplate.findFirst({
      where: { id: params.id, companyId },
      include: { _count: { select: { types: true } } },
    })

    if (!template) return withCors(ApiResponse.error('Template not found', 404), origin)

    // Check if template is in use
    if (template._count.types > 0) {
      // Soft-archive when template is in use by certification types
      const schema = (template.fieldsSchema as Record<string, any>) || {}
      schema.status = 'Archived'

      await prisma.certificationTemplate.update({
        where: { id: params.id },
        data: { fieldsSchema: schema, updatedAt: new Date() },
      })

      return withCors(
        ApiResponse.success(
          null,
          'Template is linked to existing certification types. It has been archived instead of deleted.',
        ),
        origin,
      )
    }

    await prisma.certificationTemplate.delete({
      where: { id: params.id },
    })

    return withCors(ApiResponse.success(null, 'Template deleted successfully'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
