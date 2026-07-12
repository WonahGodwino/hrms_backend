// src/app/api/admin/token-cost-config/[id]/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * PATCH /api/admin/token-cost-config/[id]
 * SUPER_ADMIN only.
 *
 * Update a config row (label, tokensPerUnit, costPerUnit, currency).
 * If activate=true, deactivate all others and activate this row.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user  = await getUserFromToken(token)
    if (!user || user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('SUPER_ADMIN access required', 403), origin)
    }

    const existing = await prisma.tokenCostConfig.findUnique({ where: { id: params.id } })
    if (!existing) {
      return withCors(ApiResponse.error('Token cost config not found', 404), origin)
    }

    const body = await request.json()
    const { tokensPerUnit, costPerUnit, providerCostPerUnit, currency, label, defaultAiService, defaultAiModel, activate } = body

    if (tokensPerUnit !== undefined && tokensPerUnit <= 0) {
      return withCors(ApiResponse.error('tokensPerUnit must be a positive integer', 400), origin)
    }
    if (costPerUnit !== undefined && costPerUnit < 0) {
      return withCors(ApiResponse.error('costPerUnit must be a non-negative number', 400), origin)
    }
    if (providerCostPerUnit !== undefined && providerCostPerUnit < 0) {
      return withCors(ApiResponse.error('providerCostPerUnit must be a non-negative number', 400), origin)
    }

    const updateData: Record<string, unknown> = { updatedBy: user.userId }
    if (tokensPerUnit       !== undefined) updateData.tokensPerUnit       = parseInt(tokensPerUnit, 10)
    if (costPerUnit         !== undefined) updateData.costPerUnit         = parseFloat(costPerUnit)
    if (providerCostPerUnit !== undefined) updateData.providerCostPerUnit = parseFloat(providerCostPerUnit)
    if (currency            !== undefined) updateData.currency            = currency.toUpperCase().slice(0, 3)
    if (label               !== undefined) updateData.label               = label
    if (defaultAiService    !== undefined) updateData.defaultAiService    = defaultAiService || null
    if (defaultAiModel      !== undefined) updateData.defaultAiModel      = defaultAiModel || null

    let updatedConfig: any

    if (activate) {
      await prisma.$transaction(async (tx) => {
        await tx.tokenCostConfig.updateMany({ data: { isActive: false } })
        updatedConfig = await tx.tokenCostConfig.update({
          where: { id: params.id },
          data:  { ...updateData, isActive: true },
        })
      })
    } else {
      updatedConfig = await prisma.tokenCostConfig.update({
        where: { id: params.id },
        data:  updateData,
      })
    }

    return withCors(
      ApiResponse.success({ config: updatedConfig }, 'Token cost config updated successfully'),
      origin
    )
  } catch (error: unknown) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

/**
 * DELETE /api/admin/token-cost-config/[id]
 * SUPER_ADMIN only. Cannot delete the active config.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user  = await getUserFromToken(token)
    if (!user || user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('SUPER_ADMIN access required', 403), origin)
    }

    const existing = await prisma.tokenCostConfig.findUnique({ where: { id: params.id } })
    if (!existing) {
      return withCors(ApiResponse.error('Token cost config not found', 404), origin)
    }
    if (existing.isActive) {
      return withCors(
        ApiResponse.error('Cannot delete the active rate config. Activate another rate first.', 409),
        origin
      )
    }

    await prisma.tokenCostConfig.delete({ where: { id: params.id } })

    return withCors(
      ApiResponse.success({}, 'Token cost config deleted'),
      origin
    )
  } catch (error: unknown) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
