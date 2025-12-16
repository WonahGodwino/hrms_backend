//src/app/api/jobs/[id]/route.ts
//HR and Admin Job Management.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Handle PUT request for updating a job
export async function PUT(request: NextRequest, context: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  const { id } = context.params

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

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
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

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
