// src/app/api/recruitment/selection/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { calculateIndustryMatchScore, extractKeywords } from '@/app/lib/keywordExtractor'
import { calculateAICVReviewScore, AICVReviewOptions } from '@/app/lib/aiCVReview'
import { aiConfig, getAPIKey, getDefaultModel } from '@/app/lib/aiConfig'
import rateLimit from '@/app/lib/rateLimiter'
import { openaiUsageTracker } from '@/app/lib/openaiUsage'

 //Initialize rate limiter
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100 // 100 requests per minute per user
})

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

    // Apply rate limiting
    try {
      await limiter.check(10, user.userId || 'anonymous') // 10 requests per minute
    } catch (rateLimitError) {
      return withCors(
        ApiResponse.error('Rate limit exceeded. Please try again in a minute.', 429),
        origin
      )
    }

    const body = await request.json()
    const { 
      jobIds, 
      useAI = aiConfig.services.openai.enabled, // Auto-detect if OpenAI is available
      autoShortlist = false, 
      threshold = 70,
      aiService = aiConfig.defaultService,
      aiModel = aiConfig.defaultModel,
      aiTemperature = 0.2,
      includeCulturalFit = true,
      includeGrowthPotential = true,
      strictness = 'medium',
      enableDetailedAnalysis = true
    } = body

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return withCors(
        ApiResponse.error('jobIds array is required', 400),
        origin
      )
    }

    // Validate AI service is available
    if (useAI) {
      const selectedService = aiConfig.services[aiService as keyof typeof aiConfig.services]
      if (!selectedService?.enabled) {
        return withCors(
          ApiResponse.error(
            `AI service "${aiService}" is not configured. ` +
            `Available services: ${Object.keys(aiConfig.services).filter(s => aiConfig.services[s as keyof typeof aiConfig.services].enabled).join(', ')}`,
            400
          ),
          origin
        )
      }
    }

    // Get company info for AI context
    const company = await prisma.company.findUnique({
      where: { id: user.companyId as string },
      select: { 
        companyName: true, 
        id: true 
      }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found', 404),
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
      aiUsed?: boolean;
      averageAIScore?: number;
      aiService?: string;
      estimatedCost?: number;
    }

    interface ShortlistedCandidate {
      applicationId: string;
      candidateId: string;
      candidateName: string;
      score: number;
      jobTitle: string;
      culturalFit?: number;
      growthPotential?: number;
      aiAnalysis?: {
        summary?: string;
        timeToProductivity?: string;
        potential?: number;
        strengths?: string[];
        weaknesses?: string[];
      };
    }

    const reviewResults: ReviewResult[] = []
    const shortlistedCandidates: ShortlistedCandidate[] = []
    let aiServiceUsed = 'none'
    let totalEstimatedCost = 0
    let totalTokensUsed = 0

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
      
      // Use Array.from instead of spread operator for Set
      const allJobKeywords = Array.from(new Set([...jobKeywords, ...savedKeywords]));

      let processedCount = 0
      let reviewedCount = 0
      let shortlistedCount = 0
      const applicationScores: number[] = []
      const aiScores: number[] = []
      let jobEstimatedCost = 0

      // Process each application
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
        
        let matchResult: any
        let aiAnalysisUsed = false
        let aiTokensUsed = 0
        
        if (useAI) {
          // Configure AI options
          const aiOptions: AICVReviewOptions = {
            useOpenAI: aiService === 'openai',
            useAnthropic: aiService === 'anthropic',
            useGemini: aiService === 'gemini',
            useLocalLLM: aiService === 'local',
            apiKey: getAPIKey(aiService),
            model: aiModel || getDefaultModel(aiService),
            temperature: aiTemperature,
            companyContext: company.companyName || '',
            industry: job.department || 'Technology', // Use job.department instead of company.industry
            seniorityLevel: getSeniorityLevel(job.position),
            strictness: strictness,
            includeCulturalFit: includeCulturalFit,
            includeGrowthPotential: includeGrowthPotential,
            enableDetailedAnalysis: enableDetailedAnalysis,
            maxTokens: 2000
          }
          
          try {
            matchResult = await calculateAICVReviewScore(jobDescription, cvText, aiOptions)
            aiServiceUsed = aiService
            aiAnalysisUsed = true
            
            // Track AI usage
            aiTokensUsed = estimateTokens(jobDescription.length + cvText.length)
            const cost = openaiUsageTracker.recordUsage(
              aiTokensUsed, 
              aiOptions.model || 'gpt-4-turbo-preview',
              'cv-review',
              user.companyId,
              user.userId,
              application.id
            )
            
            jobEstimatedCost += cost
            totalTokensUsed += aiTokensUsed
            totalEstimatedCost += cost
            
            aiScores.push(matchResult.overallScore)
            
          } catch (aiError: any) {
            console.error('AI analysis failed:', {
              error: aiError.message,
              service: aiService,
              jobId: job.id,
              applicationId: application.id
            })
            
            // Fall back to industry standard
            matchResult = calculateIndustryMatchScore(
              jobDescription,
              cvText,
              { useAIServices: false }
            )
          }
        } else {
          // Use industry-standard matching algorithm
          matchResult = calculateIndustryMatchScore(
            jobDescription,
            cvText,
            { useAIServices: false }
          )
        }

        const newScore = Math.round(matchResult.overallScore)
        applicationScores.push(newScore)

        // Build notes with detailed analysis
        let notes = `CV review completed on ${new Date().toLocaleDateString()}\n`
        notes += `Overall Score: ${matchResult.overallScore}%\n`
        
        if (aiAnalysisUsed) {
          notes += `\n=== AI ANALYSIS (${aiService.toUpperCase()}) ===\n`
          if (matchResult.aiAnalysis) {
            notes += `Summary: ${matchResult.aiAnalysis.summary}\n`
            
            if (matchResult.aiAnalysis.strengths && matchResult.aiAnalysis.strengths.length > 0) {
              notes += `Strengths:\n${matchResult.aiAnalysis.strengths.slice(0, 3).map((s: string) => `  • ${s}`).join('\n')}\n`
            }
            
            if (matchResult.aiAnalysis.weaknesses && matchResult.aiAnalysis.weaknesses.length > 0) {
              notes += `Weaknesses:\n${matchResult.aiAnalysis.weaknesses.slice(0, 3).map((w: string) => `  • ${w}`).join('\n')}\n`
            }
            
            if (matchResult.aiAnalysis.timeToProductivity) {
              notes += `Time to Productivity: ${matchResult.aiAnalysis.timeToProductivity}\n`
            }
            
            if (matchResult.aiAnalysis.suggestions && matchResult.aiAnalysis.suggestions.length > 0) {
              notes += `Suggestions:\n${matchResult.aiAnalysis.suggestions.slice(0, 2).map((s: string) => `  • ${s}`).join('\n')}\n`
            }
          }
          
          if (matchResult.culturalFit !== undefined) {
            notes += `Cultural Fit: ${matchResult.culturalFit}% ${getFitLabel(matchResult.culturalFit)}\n`
          }
          
          if (matchResult.growthPotential !== undefined) {
            notes += `Growth Potential: ${matchResult.growthPotential}% ${getPotentialLabel(matchResult.growthPotential)}\n`
          }
        }
        
        notes += `\n=== DETAILED SCORES ===\n`
        notes += `Technical Skills: ${matchResult.technicalScore}%\n`
        notes += `Experience: ${matchResult.experienceScore}%\n`
        notes += `Education: ${matchResult.educationScore}%\n`
        notes += `Soft Skills: ${matchResult.softSkillsScore}%\n`
        
        notes += `\n=== KEY FINDINGS ===\n`
        notes += `Recommendation: ${matchResult.recommendations ? matchResult.recommendations[0] || 'Review required' : 'Review required'}\n`
        
        if (matchResult.missingKeywords && matchResult.missingKeywords.length > 0) {
          notes += `Missing Critical Skills: ${matchResult.missingKeywords.slice(0, 5).join(', ')}\n`
        }
        
        if (matchResult.skillGapAnalysis) {
          const criticalGaps = matchResult.skillGapAnalysis.critical || []
          if (criticalGaps.length > 0) {
            notes += `Skill Gaps (Critical): ${criticalGaps.slice(0, 3).join(', ')}\n`
          }
        }

        // Prepare metadata
        const metadata: any = {
          reviewMethod: aiAnalysisUsed ? `ai-${aiService}` : 'industry-standard',
          reviewDate: new Date().toISOString(),
          reviewedByAI: aiAnalysisUsed,
          scores: {
            overall: matchResult.overallScore,
            technical: matchResult.technicalScore,
            experience: matchResult.experienceScore,
            education: matchResult.educationScore,
            softSkills: matchResult.softSkillsScore
          },
          skillGaps: matchResult.skillGapAnalysis || {}
        }

        if (aiAnalysisUsed) {
          metadata.aiDetails = {
            service: aiService,
            model: aiModel || getDefaultModel(aiService),
            culturalFit: matchResult.culturalFit,
            growthPotential: matchResult.growthPotential,
            aiSummary: matchResult.aiAnalysis?.summary || '',
            strengths: matchResult.aiAnalysis?.strengths?.slice(0, 3) || [],
            weaknesses: matchResult.aiAnalysis?.weaknesses?.slice(0, 3) || [],
            timeToProductivity: matchResult.aiAnalysis?.timeToProductivity || '',
            tokensUsed: aiTokensUsed,
            estimatedCost: jobEstimatedCost / job.applications.length
          }
        }

        // Update application with scores
        await prisma.jobApplication.update({
          where: { id: application.id },
          data: {
            score: newScore,
            notes: notes,
            metadata: metadata,
            reviewedAt: new Date(),
            reviewedBy: user.userId
          }
        })

        // Update stage history
        const fromStatus = lastStage?.toStatus || 'SUBMITTED'
        
        // Use camelCase for Prisma model
        await prisma.applicationStageHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: fromStatus as any,
            toStatus: 'REVIEWING',
            changedBy: user.userId || 'system',
            comment: `CV review completed. Score: ${matchResult.overallScore}%. ` +
                    `${aiAnalysisUsed ? `AI Analysis (${aiService}) used. ` : 'Industry-standard algorithm used. '}` +
                    `${matchResult.missingKeywords && matchResult.missingKeywords.length > 0 ? 
                      `Missing key skills: ${matchResult.missingKeywords.slice(0, 3).join(', ')}` : 
                      'All key skills matched'}`
          }
        })

        // Auto-shortlist if enabled and above threshold
        if (autoShortlist && matchResult.overallScore >= threshold) {
          // Use camelCase for Prisma model
          await prisma.applicationStageHistory.create({
            data: {
              applicationId: application.id,
              fromStatus: 'REVIEWING',
              toStatus: 'SHORTLISTED',
              changedBy: 'system',
              comment: `Auto-shortlisted based on match score of ${matchResult.overallScore}% (Threshold: ${threshold}%)`
            }
          })

          await prisma.jobApplication.update({
            where: { id: application.id },
            data: {
              status: 'SHORTLISTED'
            }
          })

          shortlistedCount++
          
          const candidateData: ShortlistedCandidate = {
            applicationId: application.id,
            candidateId: application.candidateId,
            candidateName: application.candidate 
              ? `${application.candidate.firstName} ${application.candidate.lastName}`
              : 'Unknown Candidate',
            score: matchResult.overallScore,
            jobTitle: job.title
          }
          
          if (aiAnalysisUsed && matchResult.aiAnalysis) {
            candidateData.culturalFit = matchResult.culturalFit
            candidateData.growthPotential = matchResult.growthPotential
            candidateData.aiAnalysis = {
              summary: matchResult.aiAnalysis.summary?.substring(0, 200) + (matchResult.aiAnalysis.summary && matchResult.aiAnalysis.summary.length > 200 ? '...' : ''),
              timeToProductivity: matchResult.aiAnalysis.timeToProductivity,
              potential: matchResult.aiAnalysis.potential,
              strengths: matchResult.aiAnalysis.strengths?.slice(0, 2),
              weaknesses: matchResult.aiAnalysis.weaknesses?.slice(0, 2)
            }
          }
          
          shortlistedCandidates.push(candidateData)
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

      // Calculate average scores
      const averageScore = applicationScores.length > 0 
        ? applicationScores.reduce((sum, score) => sum + score, 0) / applicationScores.length
        : 0
        
      const averageAIScore = aiScores.length > 0
        ? aiScores.reduce((sum, score) => sum + score, 0) / aiScores.length
        : undefined

      const jobMessage = `Processed ${processedCount} applications. ` +
                        `${useAI ? `AI (${aiService}) analysis used. ` : 'Industry-standard algorithm used. '}` +
                        `${shortlistedCount} auto-shortlisted${autoShortlist ? ` (Threshold: ${threshold}%)` : ''}.`

      reviewResults.push({
        jobId: job.id,
        jobTitle: job.title,
        totalApplications: job.applications.length,
        processedCount,
        reviewedCount,
        shortlistedCount,
        averageScore: parseFloat(averageScore.toFixed(1)),
        averageAIScore: averageAIScore ? parseFloat(averageAIScore.toFixed(1)) : undefined,
        aiUsed: useAI && processedCount > 0,
        aiService: useAI ? aiService : undefined,
        estimatedCost: jobEstimatedCost > 0 ? parseFloat(jobEstimatedCost.toFixed(4)) : undefined,
        message: jobMessage,
        shortlisted: shortlistedCount
      })
    }

    // Calculate totals for summary
    const totalJobs = jobs.length
    const totalApplications = jobs.reduce((sum, job) => sum + job.applications.length, 0)
    const totalProcessed = reviewResults.reduce((sum, r) => sum + r.processedCount, 0)
    const totalReviewed = reviewResults.reduce((sum, r) => sum + (r.reviewedCount || 0), 0)
    const totalShortlisted = reviewResults.reduce((sum, r) => sum + (r.shortlistedCount || 0), 0)
    const totalAIUsed = reviewResults.filter(r => r.aiUsed).length
    const totalCost = parseFloat(totalEstimatedCost.toFixed(4))

    // Get usage stats
    const usageStats = openaiUsageTracker.getUsageStats()

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
          aiService: aiServiceUsed !== 'none' ? aiServiceUsed : undefined,
          totalJobsWithAI: totalAIUsed,
          autoShortlistEnabled: autoShortlist,
          thresholdUsed: threshold,
          strictnessLevel: strictness,
          culturalFitAnalysis: includeCulturalFit,
          growthPotentialAnalysis: includeGrowthPotential,
          detailedAnalysis: enableDetailedAnalysis,
          cost: {
            estimatedTotal: totalCost,
            tokensUsed: totalTokensUsed,
            dailyUsage: usageStats.dailyCost,
            monthlyEstimate: usageStats.monthlyEstimate
          }
        },
        metadata: {
          reviewedBy: user.userId,
          companyId: company.id,
          timestamp: new Date().toISOString(),
          processingTime: new Date().toISOString()
        }
      }, `${useAI ? `AI-powered (${aiServiceUsed})` : 'Industry-standard'} CV review completed successfully`),
      origin
    )
  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error in CV review:', {
      error: message,
      stack: error instanceof Error ? error.stack : 'No stack trace'
    })
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

// Helper functions (kept local to this file)
function getSeniorityLevel(position: string | null): string {
  if (!position) return 'Mid-level'
  
  const positionLower = position.toLowerCase()
  if (positionLower.includes('junior') || positionLower.includes('entry') || positionLower.includes('associate')) return 'Junior'
  if (positionLower.includes('senior') || positionLower.includes('lead') || positionLower.includes('principal') || positionLower.includes('staff')) return 'Senior'
  if (positionLower.includes('director') || positionLower.includes('vp') || positionLower.includes('head') || positionLower.includes('chief')) return 'Executive'
  if (positionLower.includes('manager') || positionLower.includes('supervisor')) return 'Manager'
  return 'Mid-level'
}

function estimateTokens(textLength: number): number {
  // Rough estimate: 1 token ≈ 4 characters for English text
  return Math.ceil(textLength / 4)
}

function getFitLabel(score: number): string {
  if (score >= 90) return '⭐ Excellent'
  if (score >= 80) return '👍 Good'
  if (score >= 70) return '✅ Acceptable'
  if (score >= 60) return '⚠️ Needs Assessment'
  return '❌ Poor'
}

function getPotentialLabel(score: number): string {
  if (score >= 90) return '🚀 Exceptional'
  if (score >= 80) return '📈 High'
  if (score >= 70) return '↗️ Moderate'
  if (score >= 60) return '➡️ Average'
  return '↘️ Limited'
}