// src/app/api/recruitment/selection/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { calculateIndustryMatchScore, extractKeywords } from '@/app/lib/keywordExtractor'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

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

    const body = await request.json()
    const { jobIds, useAI = false, autoShortlist = false, threshold = 70 } = body

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return withCors(
        ApiResponse.error('jobIds array is required', 400),
        origin
      )
    }

    // Get all specified jobs for this company
    const jobs = await prisma.job.findMany({
      where: {
        id: { in: jobIds },
        companyId: user.companyId as string,
      },
      include: {
        applications: {
          include: {
            candidate: true,
            stageHistory: {
              orderBy: {
                changedAt: 'desc'
              },
              take: 1
            }
          }
        },
        keywords: true
      },
    })

    if (jobs.length === 0) {
      return withCors(
        ApiResponse.error('No jobs found for the specified IDs', 404),
        origin
      )
    }

    // Define types for arrays
    interface ReviewResult {
      jobId: string;
      jobTitle: string;
      message: string;
      processedCount: number;
      shortlisted: number;
      totalApplications?: number;
      reviewedCount?: number;
      shortlistedCount?: number;
      averageScore?: number;
    }

    interface ShortlistedCandidate {
      applicationId: string;
      candidateName: string;
      score: number;
      jobTitle: string;
    }

    const reviewResults: ReviewResult[] = []
    const shortlistedCandidates: ShortlistedCandidate[] = []

    // Process each job with industry-standard matching
    for (const job of jobs) {
      if (!job.applications.length) {
        reviewResults.push({
          jobId: job.id,
          jobTitle: job.title,
          message: 'No applications to review',
          processedCount: 0,
          shortlisted: 0
        })
        continue
      }

      // Extract job requirements
      const jobDescription = `${job.title} ${job.description} ${job.department} ${job.position}`;
      const jobKeywords = extractKeywords(jobDescription);
      
      const savedKeywords = job.keywords.map(k => k.name.toLowerCase());
      
      // FIX: Use Array.from instead of spread operator for Set
      const allJobKeywords = Array.from(new Set([...jobKeywords, ...savedKeywords]));

      let processedCount = 0
      let reviewedCount = 0
      let shortlistedCount = 0
      const applicationScores: number[] = []

      // Process each application with industry algorithm
      for (const application of job.applications) {
        // Skip if already reviewed
        const lastStage = application.stageHistory[0]
        const isAlreadyReviewed = lastStage?.toStatus === 'REVIEWING' || 
                                 lastStage?.toStatus === 'SHORTLISTED' ||
                                 lastStage?.toStatus === 'INTERVIEWING'
        
        if (isAlreadyReviewed) {
          // Still count the existing score if available
          if (application.score !== null) {
            applicationScores.push(application.score)
          }
          continue
        }

        const cvText = application.parsedCvContent || ''
        
        // Use industry-standard matching algorithm
        const matchResult = calculateIndustryMatchScore(
          jobDescription,
          cvText,
          { useAIServices: useAI }
        )

        const newScore = Math.round(matchResult.overallScore)
        applicationScores.push(newScore)

        // Update application with industry scores
        await prisma.jobApplication.update({
          where: { id: application.id },
          data: {
            score: newScore,
            notes: `Industry-standard review completed. 
                    Overall: ${matchResult.overallScore}%
                    Technical: ${matchResult.technicalScore}%
                    Experience: ${matchResult.experienceScore}%
                    Education: ${matchResult.educationScore}%
                    Soft Skills: ${matchResult.softSkillsScore}%
                    Recommendation: ${matchResult.recommendations[0] || 'Review required'}`
          }
        })

        // Update stage history
        const fromStatus = lastStage?.toStatus || 'SUBMITTED'
        
        await prisma.applicationStageHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: fromStatus as any,
            toStatus: 'REVIEWING',
            changedBy: user.userId || 'system',
            comment: `Industry-standard CV review completed. Score: ${matchResult.overallScore}%. 
                     ${matchResult.missingKeywords.length > 0 ? 
                       `Missing: ${matchResult.missingKeywords.slice(0, 3).join(', ')}` : 
                       'All key skills matched'}`
          }
        })

        // Auto-shortlist if enabled and above threshold
        if (autoShortlist && matchResult.overallScore >= threshold) {
          await prisma.applicationStageHistory.create({
            data: {
              applicationId: application.id,
              fromStatus: 'REVIEWING',
              toStatus: 'SHORTLISTED',
              changedBy: 'system',
              comment: `Auto-shortlisted based on industry match score of ${matchResult.overallScore}%`
            }
          })

          await prisma.jobApplication.update({
            where: { id: application.id },
            data: {
              status: 'SHORTLISTED'
            }
          })

          shortlistedCount++
          shortlistedCandidates.push({
            applicationId: application.id,
            candidateName: application.candidate 
              ? `${application.candidate.firstName} ${application.candidate.lastName}`
              : 'Unknown Candidate',
            score: matchResult.overallScore,
            jobTitle: job.title
          })
        } else {
          // Just mark as reviewed
          await prisma.jobApplication.update({
            where: { id: application.id },
            data: {
              status: 'REVIEWING'
            }
          })
        }

        reviewedCount++
        processedCount++
      }

      // Calculate average score
      const averageScore = applicationScores.length > 0 
        ? applicationScores.reduce((sum, score) => sum + score, 0) / applicationScores.length
        : 0

      reviewResults.push({
        jobId: job.id,
        jobTitle: job.title,
        totalApplications: job.applications.length,
        processedCount,
        reviewedCount,
        shortlistedCount,
        averageScore: parseFloat(averageScore.toFixed(1)),
        message: `Processed ${processedCount} applications with industry-standard algorithm. 
                 ${shortlistedCount} auto-shortlisted.`,
        shortlisted: shortlistedCount
      })
    }

    // Calculate totals for summary
    const totalJobs = jobs.length
    const totalApplications = jobs.reduce((sum, job) => sum + job.applications.length, 0)
    const totalProcessed = reviewResults.reduce((sum, r) => sum + r.processedCount, 0)
    const totalReviewed = reviewResults.reduce((sum, r) => sum + (r.reviewedCount || 0), 0)
    const totalShortlisted = reviewResults.reduce((sum, r) => sum + (r.shortlistedCount || 0), 0)

    return withCors(
      ApiResponse.success({
        results: reviewResults,
        shortlistedCandidates: autoShortlist ? shortlistedCandidates : undefined,
        summary: {
          totalJobs,
          totalApplications,
          totalProcessed,
          totalReviewed,
          totalShortlisted,
          aiUsed: useAI,
          autoShortlistEnabled: autoShortlist,
          thresholdUsed: threshold
        }
      }, 'Industry-standard CV review completed'),
      origin
    )
  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error in industry review:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}