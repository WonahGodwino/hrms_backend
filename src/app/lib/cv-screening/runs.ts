// The async "run" pair for this module, mirroring the convention established
// by payroll generation (lib/payroll/generation/generate-payroll.ts): a fast
// synchronous start that creates the run + per-file rows and returns
// immediately, and a slow, unawaited background pass that does the actual
// extraction + AI scoring with independent, idempotent per-row writes (never
// one big $transaction, since Prisma's interactive-transaction timeout breaks on
// batches this size, the exact pain point that pattern already works around).
import { prisma } from '@/app/lib/db'
import { Prisma } from '@prisma/client'
import { calculateAICVReviewScore, AICVReviewOptions } from '@/app/lib/aiCVReview'
import { getAPIKey, getDefaultModel } from '@/app/lib/aiConfig'
import { extractCandidateCvText, validateCvFile, MAX_FILES_PER_RUN } from './cvIntake'
import { buildWeightsFromCriteria, type ScreeningCriterion } from './weights'
import { getScreeningProfile } from './profiles'
import { screeningCvResultKey, uploadDocumentObject } from '@/app/lib/storage/documents'

export const STALE_RUN_THRESHOLD_MS = 15 * 60 * 1000

export class RunValidationError extends Error {}

export interface IncomingCvFile {
  fileName: string
  mimeType: string
  buffer: Buffer
  sizeBytes: number
}

export interface StartRunParams {
  companyId: string
  profileId: string
  mode: 'BULK' | 'QUICK'
  files: IncomingCvFile[]
  useAI: boolean
  aiService?: string
  aiModel?: string
  strictness?: string
  triggeredBy: string
}

export interface StartRunResult {
  runId: string
  totalCandidates: number
}

export async function startScreeningRun(params: StartRunParams): Promise<StartRunResult> {
  const { companyId, profileId, mode, files, useAI, aiService, aiModel, strictness, triggeredBy } = params

  if (files.length === 0) {
    throw new RunValidationError('At least one CV file is required')
  }
  if (files.length > MAX_FILES_PER_RUN) {
    throw new RunValidationError(`A single screening cannot exceed ${MAX_FILES_PER_RUN} files`)
  }

  const profile = await getScreeningProfile(profileId, companyId)
  if (!profile) {
    throw new RunValidationError('Screening profile not found')
  }
  if (profile.status !== 'ACTIVE') {
    throw new RunValidationError('This screening profile is archived and cannot be used for a new screening')
  }

  // Validate every file up front, so a single bad file fails the whole start
  // fast, instead of discovering it mid-background-run. Keep the detected
  // mime types so the createMany below doesn't re-run file-type detection.
  const detectedMimeTypes: string[] = []
  for (const file of files) {
    const result = await validateCvFile(file.buffer, file.fileName, file.sizeBytes)
    if (!result.valid) {
      throw new RunValidationError(result.error || `"${file.fileName}" is invalid`)
    }
    detectedMimeTypes.push(result.mimeType || file.mimeType)
  }

  const run = await prisma.screeningRun.create({
    data: {
      companyId,
      profileId,
      mode,
      status: 'PROCESSING',
      totalCandidates: files.length,
      useAI,
      aiService: useAI ? aiService : null,
      aiModel: useAI ? aiModel : null,
      strictness: strictness || null,
      triggeredBy,
    },
  })

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const created = await prisma.screeningCvResult.create({
      data: {
        companyId,
        runId: run.id,
        fileName: file.fileName,
        mimeType: detectedMimeTypes[i],
        sizeBytes: file.sizeBytes,
        data: new Uint8Array(file.buffer),
        status: 'PENDING',
      },
    })
    await uploadDocumentObject(
      screeningCvResultKey(companyId, created.id),
      file.buffer,
      (key) => prisma.screeningCvResult.update({ where: { id: created.id }, data: { s3Key: key } }),
      detectedMimeTypes[i] || 'application/octet-stream',
    ).catch(() => {})
  }

  return { runId: run.id, totalCandidates: files.length }
}

function aiOptionsFor(service: string | null, model: string | null, strictness: string | null, weights: ReturnType<typeof buildWeightsFromCriteria>): AICVReviewOptions {
  return {
    useOpenAI: service === 'openai',
    useAnthropic: service === 'anthropic',
    useGemini: service === 'gemini',
    useLocalLLM: service === 'local',
    apiKey: service ? getAPIKey(service) : undefined,
    model: model || (service ? getDefaultModel(service) : undefined),
    strictness: (strictness as AICVReviewOptions['strictness']) || 'medium',
    includeCulturalFit: true,
    includeGrowthPotential: true,
    weights,
  }
}

function estimateTokens(textLength: number): number {
  return Math.ceil(textLength / 4)
}

export async function processScreeningRunInBackground(runId: string): Promise<void> {
  const run = await prisma.screeningRun.findUnique({ where: { id: runId } })
  if (!run) return

  try {
    const profile = await prisma.screeningProfile.findUnique({ where: { id: run.profileId } })
    if (!profile) throw new Error('Screening profile no longer exists')

    const weights = buildWeightsFromCriteria(profile.criteria as unknown as ScreeningCriterion[])

    const tokenRateConfig = await prisma.tokenCostConfig.findFirst({
      where: { isActive: true },
      select: { tokensPerUnit: true, costPerUnit: true, providerCostPerUnit: true },
    })
    const rateTokensPerUnit = tokenRateConfig?.tokensPerUnit ?? 1000
    const rateCostPerUnit = tokenRateConfig?.costPerUnit ?? 0.3
    const rateProviderPerUnit = tokenRateConfig?.providerCostPerUnit ?? 0.015

    const pending = await prisma.screeningCvResult.findMany({
      where: { runId, status: 'PENDING' },
    })

    for (const result of pending) {
      let itemSucceeded = false
      try {
        await prisma.screeningCvResult.update({ where: { id: result.id }, data: { status: 'PROCESSING' } })

        const cvText = await extractCandidateCvText(Buffer.from(result.data), result.mimeType, result.fileName)
        if (!cvText) {
          throw new Error('Could not extract any text from this CV file')
        }

        const aiOptions = aiOptionsFor(run.aiService, run.aiModel, run.strictness, weights)
        const match = run.useAI
          ? await calculateAICVReviewScore(profile.description, cvText, aiOptions)
          : await calculateAICVReviewScore(profile.description, cvText, { ...aiOptions, useOpenAI: false, useAnthropic: false, useGemini: false, useLocalLLM: false })

        if (run.useAI) {
          const tokensUsed = estimateTokens(profile.description.length + cvText.length)
          const cost = parseFloat(((tokensUsed / rateTokensPerUnit) * rateCostPerUnit).toFixed(6))
          const actualCost = parseFloat(((tokensUsed / rateTokensPerUnit) * rateProviderPerUnit).toFixed(6))

          await prisma.screeningUsageLog.create({
            data: {
              companyId: run.companyId,
              runId: run.id,
              resultId: result.id,
              service: run.aiService || 'none',
              model: run.aiModel || aiOptions.model || 'unknown',
              tokensUsed,
              cost,
              actualCost,
              endpoint: 'cv-screening',
              inputLength: profile.description.length,
              outputLength: cvText.length,
            },
          })
        }

        await prisma.screeningCvResult.update({
          where: { id: result.id },
          data: {
            status: 'SCORED',
            overallScore: match.overallScore,
            technicalScore: match.technicalScore,
            experienceScore: match.experienceScore,
            educationScore: match.educationScore,
            softSkillsScore: match.softSkillsScore,
            culturalFit: match.culturalFit ?? null,
            growthPotential: match.growthPotential ?? null,
            aiSummary: match.aiAnalysis?.summary || null,
            aiDetails: match.aiAnalysis
              ? {
                  strengths: match.aiAnalysis.strengths,
                  weaknesses: match.aiAnalysis.weaknesses,
                  suggestions: match.aiAnalysis.suggestions,
                  riskFactors: match.aiAnalysis.riskFactors,
                  timeToProductivity: match.aiAnalysis.timeToProductivity,
                  keywords: match.keywordMatches,
                  skillGaps: match.skillGapAnalysis,
                  recommendations: match.recommendations,
                }
              : Prisma.JsonNull,
            scoredAt: new Date(),
          },
        })
        itemSucceeded = true
      } catch (itemError) {
        await prisma.screeningCvResult.update({
          where: { id: result.id },
          data: {
            status: 'FAILED',
            errorMessage: itemError instanceof Error ? itemError.message : 'Unknown error scoring this CV',
          },
        })
      }

      await prisma.screeningRun
        .update({
          where: { id: runId },
          data: {
            processedCount: { increment: 1 },
            succeededCount: { increment: itemSucceeded ? 1 : 0 },
            failedCount: { increment: itemSucceeded ? 0 : 1 },
          },
        })
        .catch((e) => console.error('[CV_SCREENING] Failed to update run counters:', e))
    }

    await prisma.screeningRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
  } catch (error) {
    await prisma.screeningRun
      .update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error processing this screening',
          completedAt: new Date(),
        },
      })
      .catch((e) => console.error('[CV_SCREENING] Failed to flip run to FAILED:', e))
  }
}
