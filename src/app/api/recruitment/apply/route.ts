// src/app/api/recruitment/apply/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['STAFF'])

    const { jobId } = await request.json()

    if (!jobId) {
      return withCors(ApiResponse.error('Job ID is required', 400), origin)
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin)
    }

    if (job.expirationDate < new Date()) {
      return withCors(ApiResponse.error('Job posting has expired', 400), origin)
    }

    // Create the job application
    const application = await prisma.jobApplication.create({
      data: {
        jobId: job.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        cv: '', // Store CV path here
        status: 'PENDING',
      },
    })

    return withCors(ApiResponse.success(application, 'Application submitted successfully'), origin)
  } catch (error) {
    return withCors(ApiResponse.error(error.message, 500), origin)
  }
}
