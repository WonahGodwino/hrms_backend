//src/app/api/jobs/[id]/route.ts
//HR and Admin Job Management.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function mapAuthErrorStatus(message: string): number {
  return message.toLowerCase().includes('insufficient permissions') ? 403 : 401
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Permission check shared with status/edit routes.
async function checkJobPermission(user: any, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  if (user.role === 'ADMIN') {
    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: user.userId, companyId, role: { in: ['ADMIN', 'ALL'] } },
      select: { id: true },
    })
    return !!userCompany
  }
  if (user.role === 'HR') return user.companyId === companyId
  return false
}

// Handle GET request for a single job (any status — needed so HR can view/edit
// CLOSED or DRAFT jobs, which the paginated list endpoint may not surface).
export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  const { id } = context.params

  try {
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) {
      return withCors(ApiResponse.error('Invalid or missing Authorization header', 401), origin)
    }

    let user
    try {
      user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    } catch (authError) {
      const message = formatError(authError)
      return withCors(ApiResponse.error(message, mapAuthErrorStatus(message)), origin)
    }

    const job = await prisma.job.findFirst({
      where: { id, company: { archived: 0 } },
      include: {
        company: { select: { id: true, companyName: true } },
        _count: { select: { applications: true } },
      },
    })

    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin)
    }

    const hasPermission = await checkJobPermission(user, job.companyId)
    if (!hasPermission) {
      return withCors(ApiResponse.error('You do not have permission to view this job', 403), origin)
    }

    const { _count, company, ...rest } = job as any
    return withCors(
      ApiResponse.success(
        {
          ...rest,
          companyName: company?.companyName ?? null,
          applicationCount: _count?.applications ?? 0,
        },
        'Job fetched successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Handle PUT request for updating a job
export async function PUT(request: NextRequest, context: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  const { id } = context.params

  try {
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) {
      return withCors(ApiResponse.error('Invalid or missing Authorization header', 401), origin)
    }

    let user
    try {
      user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'SUPER_ADMIN'])
    } catch (authError) {
      const message = formatError(authError)
      return withCors(ApiResponse.error(message, mapAuthErrorStatus(message)), origin)
    }

    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }

    const companyId = user.companyId as string

    // Get job data from request
    const { title, description, department, position, expirationDate } = await request.json()

    // Check if job belongs to the user's company
    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin)
    }

    if (job.companyId !== companyId) {
      return withCors(ApiResponse.error('You cannot update this job', 403), origin)
    }

    // Update job
    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        title,
        description,
        department,
        position,
        expirationDate: new Date(expirationDate), // Convert to Date
        updatedBy: user.userId,  // Track who updated
      },
    })

    return withCors(ApiResponse.success(updatedJob, 'Job updated successfully'), origin)
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Handle DELETE request for deleting a job
export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  const { id } = context.params

  try {
    const token = extractBearerToken(request.headers.get('authorization'))
    if (!token) {
      return withCors(ApiResponse.error('Invalid or missing Authorization header', 401), origin)
    }

    let user
    try {
      user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'SUPER_ADMIN'])
    } catch (authError) {
      const message = formatError(authError)
      return withCors(ApiResponse.error(message, mapAuthErrorStatus(message)), origin)
    }

    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }

    const companyId = user.companyId as string

    // Check if job exists and belongs to the user's company
    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin)
    }

    if (job.companyId !== companyId) {
      return withCors(ApiResponse.error('You cannot delete this job', 403), origin)
    }

    // Delete the job
    await prisma.job.delete({ where: { id } })

    return withCors(ApiResponse.success(null, 'Job deleted successfully'), origin)
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
