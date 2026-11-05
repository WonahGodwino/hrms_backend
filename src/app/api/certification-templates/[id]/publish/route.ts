import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/certification-templates/[id]/publish
// Body: { companyId? }
// Flips the template's stored status from Draft to Active inside fieldsSchema,
// mirroring how the rest of the template record is persisted.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const template = await prisma.certificationTemplate.findFirst({
      where: { id: params.id, companyId: resolved.companyId },
    })
    if (!template) {
      return withCors(ApiResponse.error('Certification template not found', 404), origin)
    }

    const schema: Record<string, Prisma.InputJsonValue> = typeof template.fieldsSchema === 'object' && template.fieldsSchema !== null
      ? { ...(template.fieldsSchema as Record<string, Prisma.InputJsonValue>) }
      : {}
    schema.status = 'Active'

    const updated = await prisma.certificationTemplate.update({
      where: { id: template.id },
      data: { fieldsSchema: schema },
    })

    await prisma.trainingAuditLog.create({
      data: {
        companyId: resolved.companyId,
        actorId: user.userId,
        action: 'TEMPLATE_PUBLISHED',
        entityType: 'certification_template',
        entityId: template.id,
        metadata: { name: template.name },
      },
    })

    return withCors(
      ApiResponse.success(
        { id: updated.id, name: updated.name, status: 'Active' },
        'Template published successfully',
      ),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
