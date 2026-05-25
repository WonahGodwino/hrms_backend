import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PUT /api/certification-templates/:id
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const template = await prisma.certificationTemplate.findFirst({
      where: { id: params.id, companyId: user.companyId },
    })
    if (!template) return withCors(ApiResponse.error('Template not found', 404), origin)

    const body = await req.json()
    const updated = await prisma.certificationTemplate.update({
      where: { id: params.id },
      data: {
        ...(body.name         !== undefined && { name:         body.name }),
        ...(body.fieldsSchema !== undefined && { fieldsSchema: body.fieldsSchema }),
      },
    })
    return withCors(ApiResponse.success(updated, 'Template updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
