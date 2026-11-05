// src/app/api/pfa/[id]/route.ts
//
// Update (or deactivate) one PFA entry. SUPER_ADMIN/ADMIN only, same guard as
// the create endpoint in ../route.ts.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

type RouteParams = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const existing = await prisma.pensionFundAdministrator.findUnique({ where: { id: params.id } })
    if (!existing) return withCors(ApiResponse.error('PFA not found', 404), origin)

    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.code !== undefined) {
      const code = String(body.code).trim().toUpperCase()
      if (!code || code.length > 50) return withCors(ApiResponse.error('code must be 1-50 characters', 400), origin)
      if (code !== existing.code) {
        const clash = await prisma.pensionFundAdministrator.findUnique({ where: { code } })
        if (clash) return withCors(ApiResponse.error(`Code "${code}" already exists`, 409), origin)
      }
      data.code = code
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name || name.length > 200) return withCors(ApiResponse.error('name must be 1-200 characters', 400), origin)
      data.name = name
    }

    if (body.isActive !== undefined) {
      data.isActive = !!body.isActive
    }

    const pfa = await prisma.pensionFundAdministrator.update({ where: { id: params.id }, data })
    return withCors(ApiResponse.success(pfa, 'PFA updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
