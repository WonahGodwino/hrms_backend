// src/app/api/admin/token-cost-config/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/admin/token-cost-config
 *
 * Any authenticated user → returns the currently active rate only.
 * SUPER_ADMIN           → returns all configs (history) + active row.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user  = await getUserFromToken(token)
    if (!user) {
      return withCors(ApiResponse.error('Invalid or expired token', 401), origin)
    }

    // All authenticated users can see the active rate (needed for display)
    const activeConfig = await prisma.tokenCostConfig.findFirst({
      where:   { isActive: true },
      select:  { id: true, tokensPerUnit: true, costPerUnit: true, providerCostPerUnit: true, currency: true, label: true, updatedAt: true },
    })

    if (user.role !== 'SUPER_ADMIN') {
      return withCors(
        ApiResponse.success({ activeConfig }, 'Active token cost config retrieved'),
        origin
      )
    }

    // SUPER_ADMIN gets full history
    const all = await prisma.tokenCostConfig.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return withCors(
      ApiResponse.success({ activeConfig, all }, 'Token cost configs retrieved'),
      origin
    )
  } catch (error: unknown) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

/**
 * POST /api/admin/token-cost-config
 * SUPER_ADMIN only.
 *
 * Body:
 *   tokensPerUnit        number   e.g. 1000
 *   costPerUnit          number   e.g. 0.10  (USD — billed to tenant)
 *   providerCostPerUnit  number?  e.g. 0.01  (USD — our actual AI provider cost)
 *   currency             string?  default 'USD'
 *   label                string?  human-readable note
 *   activate             boolean? if true, deactivate all others and activate this one immediately
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { tokensPerUnit, costPerUnit, providerCostPerUnit, currency = 'USD', label, defaultAiService, defaultAiModel, activate = false } = body

    if (!tokensPerUnit || tokensPerUnit <= 0) {
      return withCors(ApiResponse.error('tokensPerUnit must be a positive integer', 400), origin)
    }
    if (costPerUnit == null || costPerUnit < 0) {
      return withCors(ApiResponse.error('costPerUnit must be a non-negative number', 400), origin)
    }
    if (providerCostPerUnit != null && providerCostPerUnit < 0) {
      return withCors(ApiResponse.error('providerCostPerUnit must be a non-negative number', 400), origin)
    }

    const data = {
      tokensPerUnit:       parseInt(tokensPerUnit, 10),
      costPerUnit:         parseFloat(costPerUnit),
      providerCostPerUnit: providerCostPerUnit != null ? parseFloat(providerCostPerUnit) : 0.015,
      currency:            currency.toUpperCase().slice(0, 3),
      label:               label || null,
      defaultAiService:    defaultAiService || null,
      defaultAiModel:      defaultAiModel || null,
      createdBy:           user.userId as string,
    }

    let newConfig: any

    if (activate) {
      // Deactivate all existing, then create the new active one atomically
      await prisma.$transaction(async (tx) => {
        await tx.tokenCostConfig.updateMany({ data: { isActive: false } })
        newConfig = await tx.tokenCostConfig.create({ data: { ...data, isActive: true } })
      })
    } else {
      newConfig = await prisma.tokenCostConfig.create({ data: { ...data, isActive: false } })
    }

    return withCors(
      ApiResponse.success({ config: newConfig }, 'Token cost config created successfully'),
      origin
    )
  } catch (error: unknown) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
