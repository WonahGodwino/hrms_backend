// [ai-assistant] Super Admin success metrics — GET ?days=90 (1 to 365).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { successMetrics } from '@/app/lib/ai/metrics'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])
    const days = Math.min(Math.max(Math.floor(Number(new URL(req.url).searchParams.get('days'))) || 90, 1), 365)
    return withCors(ApiResponse.success(await successMetrics(prisma, days)), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}