// src/app/api/core-setup/readiness/route.ts
//
// GET /api/core-setup/readiness?companyId=...
//
// The single source of truth for the Guided Setup journey. Computes per-stage
// readiness from real configuration (see lib/core-setup/readiness.ts), merges
// with the persisted journey state (completed stages stay ✓ even if records
// are later deleted), and persists a progress snapshot on each read.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { computeReadiness } from '@/app/lib/core-setup/readiness'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const VALID_STAGES = ['company', 'organization', 'roles', 'compensation', 'people', 'payroll']

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const user = requireRole(authHeader.replace('Bearer ', ''), ['SUPER_ADMIN', 'ADMIN', 'HR'])

    // Non-super-admins are locked to their own company; super-admins may
    // pass an explicit companyId.
    let companyId: string | null
    if (user.role === 'SUPER_ADMIN') {
      companyId = new URL(request.url).searchParams.get('companyId') || user.companyId || null
    } else {
      companyId = user.companyId || null
    }
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }

    // Compute live readiness.
    const readiness = await computeReadiness(companyId)

    // Merge with the persisted journey state (union of completed stages —
    // a stage stays checked off even if the module's records are deleted).
    const persisted = await (prisma as any).guidedSetupState.findUnique({
      where: { companyId },
    })
    const persistedStages: string[] = Array.isArray(persisted?.completedStages)
      ? persisted.completedStages.filter((s: unknown): s is string =>
          typeof s === 'string' && VALID_STAGES.includes(s))
      : []

    for (const stage of readiness.stages) {
      if (persistedStages.includes(stage.key) && stage.status === 'upcoming') {
        // Persisted-complete but live-incomplete: surface as completed-with-
        // history rather than locked, so the journey never regresses.
        stage.status = 'completed'
        for (const req of stage.requirements) req.done = true
        stage.score = Math.max(stage.score, 100)
      }
    }

    // Recompute first-incomplete statuses after the union merge.
    const firstIncomplete = readiness.stages.findIndex((s) => s.score < 100)
    readiness.stages.forEach((stage, i) => {
      const complete = stage.score >= 100
      if (complete) {
        if (stage.status !== 'completed') stage.status = 'completed'
      } else if (i === firstIncomplete) {
        stage.status = i === 0 ? 'ready' : 'current'
      } else if (stage.status === 'upcoming') {
        stage.status = 'upcoming'
      }
    })

    const completedCount = readiness.stages.filter((s) => s.score >= 100).length
    const progress = Math.round(
      readiness.stages.reduce((sum, s) => sum + s.score, 0) / readiness.stages.length
    )

    // Persist a snapshot (fire-and-forget semantics — awaited for simplicity;
    // a write failure shouldn't fail the read).
    try {
      const nowComplete = readiness.stages
        .filter((s) => s.score >= 100)
        .map((s) => s.key)
      const union = [...new Set([...persistedStages, ...nowComplete])]
      const data = {
        completedStages: union,
        started: true,
        progress,
        updatedBy: user.userId,
      }
      await (prisma as any).guidedSetupState.upsert({
        where: { companyId },
        update: data,
        create: { companyId, ...data, exited: false },
      })
    } catch (err) {
      console.warn('[readiness] failed to persist journey snapshot', err)
    }

    return withCors(
      ApiResponse.success({
        ...readiness,
        progress,
        completedStages: completedCount,
        journeyStarted: persisted?.started ?? true,
        journeyExited: persisted?.exited ?? false,
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
