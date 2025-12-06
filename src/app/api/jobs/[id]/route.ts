// src/app/api/jobs/[id]/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

type RouteContext = {
  params: { id: string }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const origin = request.headers.get('origin')
  const { id } = context.params

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for this user', 400),
        origin
      )
    }

    // Ensure the job belongs to this company
    const job = await prisma.job.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    })

    if (!job) {
      return withCors(
        ApiResponse.error('Job not found', 404),
        origin
      )
    }

    if (job.companyId !== user.companyId) {
      return withCors(
        ApiResponse.error('You are not allowed to delete this job', 403),
        origin
      )
    }

    await prisma.job.delete({ where: { id } })

    return withCors(
      ApiResponse.success(null, 'Job deleted successfully'),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
