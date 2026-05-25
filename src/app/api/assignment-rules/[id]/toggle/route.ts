import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/assignment-rules/[id]/toggle
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId: user.companyId },
    })
    if (!rule) return withCors(ApiResponse.error('Assignment rule not found', 404), origin)

    const updated = await prisma.assignmentRule.update({
      where: { id: params.id },
      data: { enabled: !rule.enabled },
    })

    return withCors(
      ApiResponse.success(updated, `Assignment rule ${updated.enabled ? 'enabled' : 'disabled'}`),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
