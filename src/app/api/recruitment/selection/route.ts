// src/app/api/recruitment/selection/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
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

    const body = await request.json().catch(() => null)

    if (!body || !body.jobId) {
      return withCors(
        ApiResponse.error('jobId is required', 400),
        origin
      )
    }

    const { jobId } = body

    // 🔎 Fetch job *scoped by companyId*
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        companyId: user.companyId as string,
      },
      include: {
        applications: true, // relation name from your Prisma schema
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

    const applicants = job.applications as any[]

    if (!applicants.length) {
      return withCors(
        ApiResponse.success(
          {
            job: {
              id: job.id,
              title: job.title,
            },
            applicants: [],
          },
          'No applications found for this job'
        ),
        origin
      )
    }

    // 🧠 Extract keywords from job description (and title to make it richer)
    const jobText = [
      job.title || '',
      job.description || '',
      (job as any).requirements || '',
      (job as any).responsibilities || '',
    ]
      .join(' ')
      .trim()

    let jobKeywords = extractKeywords(jobText)
      .map((k) => k.toLowerCase().trim())
      .filter(Boolean)

    // De-duplicate keywords
    jobKeywords = Array.from(new Set(jobKeywords))

    // 🧮 Rank applicants based on keyword matching in parsedCvContent
    const rankedApplicants = applicants.map((applicant) => {
      const cvText =
        (applicant.parsedCvContent as string | undefined)?.toLowerCase?.() || ''

      let matchCount = 0
      const matchedKeywords: string[] = []

      for (const keyword of jobKeywords) {
        if (!keyword) continue
        if (cvText.includes(keyword)) {
          matchCount++
          matchedKeywords.push(keyword)
        }
      }

      const score =
        jobKeywords.length > 0 ? matchCount / jobKeywords.length : 0

      return {
        ...applicant,
        matchCount,
        score, // 0–1 ratio of matched keywords
        matchedKeywords: Array.from(new Set(matchedKeywords)),
      }
    })

    // ⬇️ Sort by matchCount (desc), then by createdAt (oldest first if same score)
    const sortedApplicants = rankedApplicants.sort((a, b) => {
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount
      }
      const aDate = new Date(a.createdAt || 0).getTime()
      const bDate = new Date(b.createdAt || 0).getTime()
      return aDate - bDate
    })

    // Add explicit rank for UI (1 = most qualified)
    const applicantsWithRank = sortedApplicants.map((app, index) => ({
      ...app,
      rank: index + 1,
    }))

    return withCors(
      ApiResponse.success(
        {
          job: {
            id: job.id,
            title: job.title,
          },
          applicants: applicantsWithRank,
        },
        'Applicants ranked based on keyword match'
      ),
      origin
    )
  } catch (error: unknown) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
