// src/app/api/recruitment/selection/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse } from '@/app/lib/utils'
import { extractKeywords } from '@/app/lib/keywordExtractor'

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    // Fetch job qualifications/keywords
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { applicants: true },
    })

    if (!job) {
      return ApiResponse.error('Job not found', 404)
    }

    const applicants = job.applicants

    // Extract job description keywords
    const jobKeywords = extractKeywords(job.description)

    // Rank applicants based on keyword matching
    const rankedApplicants = applicants.map((applicant) => {
      let matchCount = 0

      // Check if keywords from job description match any part of the CV
      jobKeywords.forEach((keyword) => {
        if (applicant.parsedCvContent.toLowerCase().includes(keyword)) {
          matchCount++
        }
      })

      return { ...applicant, matchCount }
    })

    // Sort applicants by match count (most matches first)
    const sortedApplicants = rankedApplicants.sort((a, b) => b.matchCount - a.matchCount)

    return ApiResponse.success(sortedApplicants, 'Applicants ranked based on keyword match')
  } catch (error) {
    return ApiResponse.error(error.message, 500)
  }
}
