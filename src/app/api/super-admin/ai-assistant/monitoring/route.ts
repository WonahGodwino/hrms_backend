// [ai-assistant] Super Admin monitoring — GET: response time and error rate per provider, and refused requests by reason.
// Counts and timings only; no message content is read.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { monitoringSummary } from '@/app/lib/ai/monitoring'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const days = Math.min(Math.max(Math.floor(Number(new URL(req.url).searchParams.get('days'))) || 7, 1), 90)
    return withCors(ApiResponse.success(await monitoringSummary(prisma, days)), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}