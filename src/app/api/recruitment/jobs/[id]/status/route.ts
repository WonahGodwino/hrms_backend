// src/app/api/recruitment/jobs/[id]/status/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'

// Define allowed status transitions
const ALLOWED_STATUSES = ['ACTIVE', 'CLOSED', 'DRAFT', 'EXPIRED'] as const
type JobStatus = typeof ALLOWED_STATUSES[number]

const STATUS_ALIASES: Record<string, JobStatus> = {
  ACTIVE: 'ACTIVE',
  CLOSE: 'CLOSED',
  CLOSED: 'CLOSED',
  DRAFT: 'DRAFT',
  EXPIRE: 'EXPIRED',
  EXPIRED: 'EXPIRED',
}

// Define valid transitions per role (optional business logic)
const VALID_TRANSITIONS: Record<string, JobStatus[]> = {
  'ACTIVE': ['CLOSED', 'DRAFT', 'EXPIRED'],
  'CLOSED': ['ACTIVE', 'DRAFT'],
  'DRAFT': ['ACTIVE', 'CLOSED'],
  'EXPIRED': ['ACTIVE', 'CLOSED', 'DRAFT'],
}

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

// GET current status (optional but good practice)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')
  
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
      where: { 
        id: params.id,
        company: { archived: 0 }
      },
      select: {
        id: true,
        companyId: true,
        status: true,
        title: true,
        updatedAt: true,
        company: {
          select: { id: true, companyName: true }
        }
      }
    })

    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin)
    }

    // Check permissions
    const hasPermission = await checkJobPermission(user, job.companyId)
    if (!hasPermission) {
      return withCors(ApiResponse.error('Access denied', 403), origin)
    }

    return withCors(ApiResponse.success({
      ...job,
      availableTransitions: VALID_TRANSITIONS[job.status] || []
    }), origin)

  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// PATCH to update status
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')
  
  try {
    // Auth
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

    // Validate request body
    const body = await request.json()
    const { status, expirationDate } = body

    const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : ''
    const targetStatus = STATUS_ALIASES[normalizedStatus]

    if (!status) {
      return withCors(ApiResponse.error('Status is required', 400), origin)
    }

    if (!targetStatus || !ALLOWED_STATUSES.includes(targetStatus)) {
      return withCors(ApiResponse.error(
        `Invalid status. Allowed values: ACTIVE, CLOSED (or CLOSE), DRAFT, EXPIRED`,
        400
      ), origin)
    }

    // Validate expirationDate if provided
    let newExpirationDate: Date | undefined
    if (expirationDate !== undefined) {
      const parsedDate = new Date(expirationDate)
      if (isNaN(parsedDate.getTime())) {
        return withCors(ApiResponse.error('Invalid expirationDate format. Use ISO 8601 date string.', 400), origin)
      }
      newExpirationDate = parsedDate
    }

    const jobId = params.id

    // Get current job state
    const job = await prisma.job.findFirst({
      where: { 
        id: jobId,
        company: { archived: 0 }
      },
      select: { 
        id: true, 
        status: true, 
        companyId: true,
        title: true,
        expirationDate: true,
      },
    })

    if (!job) {
      return withCors(ApiResponse.error('Job not found', 404), origin)
    }

    // Check permissions
    const hasPermission = await checkJobPermission(user, job.companyId)
    if (!hasPermission) {
      return withCors(ApiResponse.error('Access denied', 403), origin)
    }

    // Validate status transition
    if (job.status === targetStatus) {
      return withCors(ApiResponse.error(`Job is already ${targetStatus.toLowerCase()}`, 400), origin)
    }

    // Business rule: Can't make expired job active without updating expiration
    if (targetStatus === 'ACTIVE' && job.expirationDate && job.expirationDate < new Date()) {
      if (!newExpirationDate) {
        return withCors(ApiResponse.error(
          'Cannot activate expired job. Please provide a new expirationDate in the future.',
          400
        ), origin)
      }
      if (newExpirationDate < new Date()) {
        return withCors(ApiResponse.error(
          'New expirationDate must be in the future.',
          400
        ), origin)
      }
    }

    // When reopening to ACTIVE, recommend expirationDate update for new expiry
    if (targetStatus === 'ACTIVE' && newExpirationDate && newExpirationDate < new Date()) {
      return withCors(ApiResponse.error(
        'Provided expirationDate must be in the future.',
        400
      ), origin)
    }

    // Optional: Check if transition is allowed
    const allowedTransitions = VALID_TRANSITIONS[job.status] || []
    if (!allowedTransitions.includes(targetStatus)) {
      return withCors(ApiResponse.error(
        `Cannot transition from ${job.status} to ${targetStatus}`,
        400
      ), origin)
    }

    // Update job status and optionally expirationDate
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: targetStatus,
        ...(newExpirationDate !== undefined && { expirationDate: newExpirationDate }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        title: true,
        status: true,
        expirationDate: true,
        updatedAt: true,
        company: {
          select: { id: true, companyName: true }
        }
      },
    })

    // Determine public board status
    const isPubliclyVisible = targetStatus === 'ACTIVE'
    const expirationUpdated = newExpirationDate !== undefined
    
    return withCors(ApiResponse.success(
      {
        ...updatedJob,
        isPubliclyVisible,
        expirationDateUpdated: expirationUpdated,
        message: isPubliclyVisible 
          ? `Job is now visible on the public board${expirationUpdated ? ' with updated expiration date' : ''}`
          : 'Job has been removed from the public board'
      },
      `Job status updated to ${targetStatus.toLowerCase()}${expirationUpdated ? ' and expiration date updated' : ''} successfully`
    ), origin)

  } catch (error) {
    const message = formatError(error)
    console.error('[JOB_STATUS] Error:', error)
    return withCors(ApiResponse.error(message || 'Error updating job status', 500), origin)
  }
}

// Helper function for permission checking
async function checkJobPermission(user: any, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') {
    return true
  } 
  else if (user.role === 'ADMIN') {
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId: companyId,
        role: { in: ['ADMIN', 'ALL'] }
      }
    })
    return !!userCompany
  }
  else if (user.role === 'HR') {
    return user.companyId === companyId
  }
  return false
}