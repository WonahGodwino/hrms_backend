import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PATCH /api/certification-templates/[id]/archive
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const template = await prisma.certificationTemplate.findFirst({
      where: { id: params.id, companyId },
    })

    if (!template) return withCors(ApiResponse.error('Template not found', 404), origin)

    const schema = (template.fieldsSchema as Record<string, any>) || {}
    schema.status = 'Archived'

    const updated = await prisma.certificationTemplate.update({
      where: { id: params.id },
      data: {
        fieldsSchema: schema,
        updatedAt: new Date(),
      },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'TEMPLATE_ARCHIVED',
        entityType: 'certification_template',
        entityId: params.id,
        metadata: { templateName: template.name },
      },
    })

    return withCors(ApiResponse.success(updated, 'Template archived successfully'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
