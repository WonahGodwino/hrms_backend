// src/app/api/recruitment/selection/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractKeywords } from '@/app/lib/keywordExtractor'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 🔐 Auth + role check
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

    const { jobId } = await request.json()

    if (!jobId) {
      return withCors(
        ApiResponse.error('jobId is required', 400),
        origin
      )
    }

    // 🔎 Fetch job *scoped by companyId*
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        companyId: user.companyId as string,
      },
      include: {
        applications: true, // relation name from your Prisma model
      },
    })

    if (!job) {
      return withCors(
        ApiResponse.error(
          'Job not found for this company or you do not have access',
          404
        ),
        origin
      )
    }

    const applicants = job.applications

    if (!applicants.length) {
      return withCors(
        ApiResponse.success([], 'No applications found for this job'),
        origin
      )
    }

    // 🧠 Extract keywords from job description
    const jobKeywords = extractKeywords(job.description || '')

    // 🧮 Rank applicants based on keyword matching in parsedCvContent
    const rankedApplicants = applicants.map((applicant) => {
      const cvText =
        (applicant as any).parsedCvContent?.toLowerCase?.() || ''

      let matchCount = 0

      jobKeywords.forEach((keyword) => {
        if (!keyword) return
        const k = keyword.toLowerCase()
        if (cvText.includes(k)) {
          matchCount++
        }
      })

      return { ...applicant, matchCount }
    })

    // ⬇️ Sort by matchCount (desc)
    const sortedApplicants = rankedApplicants.sort(
      (a, b) => b.matchCount - a.matchCount
    )

    return withCors(
      ApiResponse.success(
        {
          job: {
            id: job.id,
            title: job.title,
          },
          applicants: sortedApplicants,
        },
        'Applicants ranked based on keyword match'
      ),
      origin
    )
  } catch (error: unknown) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
