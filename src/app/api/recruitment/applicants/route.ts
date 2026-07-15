// src/app/api/recruitment/applicants/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // Get the authentication header and verify the user role
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)

    // Honour the caller's active company selection (global company switcher),
    // enforcing per-role access. Falls back to the token company when omitted,
    // so existing callers that don't pass companyId are unaffected.
    const scope = await resolveRecruitmentCompanyId(user, searchParams.get('companyId'))
    if (scope.error) {
      return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    }
    const companyId = scope.companyId as string

    // Pagination
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '20')
    const take = pageSize > 0 ? pageSize : 20
    const skip = page > 1 ? (page - 1) * take : 0

    // Filter params
    const jobTitle = searchParams.get('jobTitle') || ''
    const jobId = searchParams.get('jobId') || ''
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const searchTerm = searchParams.get('search') || ''
    const status = searchParams.get('status') || '' // Filter by application status

    // Build filter for job applications
    const where: any = {
      job: {
        companyId,
      },
    }

    if (jobTitle) {
      where.job = {
        ...where.job,
        title: { contains: jobTitle, mode: 'insensitive' },
      }
    }

    if (jobId) {
      where.jobId = jobId
    }

    if (status) where.status = status

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    if (searchTerm) {
      where.candidate = {
        OR: [
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { phone: { contains: searchTerm, mode: 'insensitive' } },
        ],
      }
    }

    // Fetch applications with all related data
    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              department: true,
              position: true,
              status: true,
            }
          },
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              address: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          cvFile: {
            select: {
              id: true,
              fileName: true,
              sizeBytes: true,
              mimeType: true,
              createdAt: true,
            },
          },
          candidateAssessment: {
            select: {
              averageScore: true,
              roundStatus: true,
              currentRoundOrder: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      prisma.jobApplication.count({ where }),
    ])

    const totalPages = Math.ceil(total / take) || 1

    // Transform the data with clean CV URLs
    const transformedApplications = applications.map(app => ({
      id: app.id,
      status: app.status,
      coverLetter: app.notes ?? null,
      appliedAt: app.createdAt,
      updatedAt: app.updatedAt,
      notes: app.notes,
      rating: app.score ?? null,
      // Interview panel score — average across all completed assessment
      // rounds for this candidate (null until at least one round completes).
      interviewScore: app.candidateAssessment?.averageScore ?? null,
      interviewRoundStatus: app.candidateAssessment?.roundStatus ?? null,
      
      // Job details
      job: {
        id: app.job.id,
        title: app.job.title,
        department: app.job.department,
        position: app.job.position,
        jobStatus: app.job.status,
      },
      
      // Applicant details
      applicant: {
        id: app.candidate.id,
        fullName: `${app.candidate.firstName} ${app.candidate.lastName}`.trim(),
        firstName: app.candidate.firstName,
        lastName: app.candidate.lastName,
        email: app.candidate.email,
        phone: app.candidate.phone,
        address: app.candidate.address,
        city: null,
        state: null,
        country: null,
        postalCode: null,
        dateOfBirth: null,
        nationality: null,
        gender: null,
        profileCreatedAt: app.candidate.createdAt,
      },
      
      // CV information mapped to application-scoped endpoint for correct file resolution
      cv: app.cvFile ? {
        id: app.cvFile.id,
        fileName: app.cvFile.fileName,
        fileSize: app.cvFile.sizeBytes,
        mimeType: app.cvFile.mimeType,
        uploadedAt: app.cvFile.createdAt,
        viewUrl: `/api/recruitment/applicants/${app.id}/cv?disposition=inline`,
        downloadUrl: `/api/recruitment/applicants/${app.id}/cv?disposition=attachment`,
        filePath: app.cvFilePath,
      } : null,
    }))

    // Group applications by job for organized view
    const groupedByJob = transformedApplications.reduce((acc, app) => {
      const jobId = app.job.id
      if (!acc[jobId]) {
        acc[jobId] = {
          jobId: app.job.id,
          jobTitle: app.job.title,
          department: app.job.department,
          position: app.job.position,
          jobStatus: app.job.jobStatus,
          applicants: [],
          totalApplicants: 0,
          stats: {
            new: 0,
            reviewed: 0,
            shortlisted: 0,
            interviewed: 0,
            offered: 0,
            hired: 0,
            rejected: 0,
          }
        }
      }
      
      // Add applicant to job group
      acc[jobId].applicants.push(app)
      acc[jobId].totalApplicants++
      
      // Update stats based on application status
      if (app.status === 'SUBMITTED') acc[jobId].stats.new++
      else if (app.status === 'REVIEWING') acc[jobId].stats.reviewed++
      else if (app.status === 'SHORTLISTED') acc[jobId].stats.shortlisted++
      else if (app.status === 'INTERVIEWING') acc[jobId].stats.interviewed++
      else if (app.status === 'OFFERED') acc[jobId].stats.offered++
      else if (app.status === 'HIRED') acc[jobId].stats.hired++
      else if (app.status === 'REJECTED') acc[jobId].stats.rejected++
      
      return acc
    }, {} as Record<string, any>)

    // Flat list optimized for tables
    const flatList = transformedApplications.map(app => ({
      // Application info
      applicationId: app.id,
      appliedAt: app.appliedAt,
      status: app.status,
      rating: app.rating,
      
      // Job info
      jobId: app.job.id,
      jobTitle: app.job.title,
      jobDepartment: app.job.department,
      jobPosition: app.job.position,
      
      // Applicant info
      applicantId: app.applicant.id,
      applicantName: app.applicant.fullName,
      applicantEmail: app.applicant.email,
      applicantPhone: app.applicant.phone,
      applicantLocation: [app.applicant.city, app.applicant.state, app.applicant.country]
        .filter(Boolean)
        .join(', '),
      
      // CV info
      hasCV: !!app.cv,
      cvId: app.cv?.id,
      cvFileName: app.cv?.fileName,
      cvViewUrl: app.cv?.viewUrl,
      cvDownloadUrl: app.cv?.downloadUrl,
    }))

    return withCors(
      ApiResponse.success(
        {
          pagination: {
            total,
            page,
            pageSize: take,
            totalPages,
          },
          filters: {
            jobTitle: jobTitle || null,
            jobId: jobId || null,
            status: status || null,
            dateRange: startDate && endDate ? { startDate, endDate } : null,
            searchTerm: searchTerm || null,
          },
          summary: {
            totalApplications: total,
            totalApplicants: new Set(applications.map(a => a.candidateId)).size,
            totalJobs: new Set(applications.map(a => a.jobId)).size,
            byStatus: {
              NEW: applications.filter(a => a.status === 'SUBMITTED').length,
              REVIEWED: applications.filter(a => a.status === 'REVIEWING').length,
              SHORTLISTED: applications.filter(a => a.status === 'SHORTLISTED').length,
              INTERVIEWED: applications.filter(a => a.status === 'INTERVIEWING').length,
              OFFERED: applications.filter(a => a.status === 'OFFERED').length,
              HIRED: applications.filter(a => a.status === 'HIRED').length,
              REJECTED: applications.filter(a => a.status === 'REJECTED').length,
              WITHDRAWN: applications.filter(a => a.status === 'WITHDRAWN').length,
            }
          },
          // Multiple data formats for frontend flexibility
          groupedByJob: Object.values(groupedByJob),
          flatList,
          detailed: transformedApplications,
        },
        'Job applications fetched successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    console.error('[APPLICANTS] Error:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}