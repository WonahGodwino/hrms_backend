import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// DELETE /api/training-programs/:id/materials/:materialId
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; materialId: string } }
) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const material = await prisma.trainingMaterial.findFirst({
      where: {
        id: params.materialId,
        companyId: resolved.companyId,
      },
    })

    if (!material) {
      return withCors(ApiResponse.error('Training material not found', 404), origin)
    }

    await prisma.trainingMaterial.delete({
      where: { id: material.id },
    })

    return withCors(
      ApiResponse.success({ id: params.materialId }, 'Training material deleted'),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
