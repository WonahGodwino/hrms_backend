// src/app/api/guided-setup/route.ts
//
// Guided Setup journey state — per company.
//
// GET  /api/guided-setup?companyId=...  → current state (null if never saved)
// PUT  /api/guided-setup
//        body: { companyId, completedStages?: string[], started?: boolean, exited?: boolean, progress?: number }
//
// The journey state complements the live module counts: a stage stays marked
// completed here even if the module's records are later deleted, and the UI
// can restore "continue where you left off" without re-deriving it.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Validate stage keys against the known guided-setup stages.
const VALID_STAGES = ['company', 'organization', 'roles', 'compensation', 'people', 'payroll']

function sanitizeStages(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((s): s is string => typeof s === 'string' && VALID_STAGES.includes(s)))]
}

// Resolve which company to operate on. Non-super-admins are locked to their
// own company; super-admins may pass an explicit companyId.
function resolveCompanyId(user: { role: string; companyId?: string | null }, requested: string | null): string | null {
  if (user.role === 'SUPER_ADMIN') return requested || user.companyId || null
  return user.companyId || null
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const user = requireRole(authHeader.replace('Bearer ', ''), ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const companyId = resolveCompanyId(
      user as { role: string; companyId?: string | null },
      new URL(request.url).searchParams.get('companyId')
    )
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }

    const state = await prisma.guidedSetupState.findUnique({ where: { companyId } })
    return withCors(ApiResponse.success(state), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const user = requireRole(authHeader.replace('Bearer ', ''), ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return withCors(ApiResponse.error('Invalid request body', 400), origin)
    }

    const companyId = resolveCompanyId(
      user as { role: string; companyId?: string | null },
      typeof body.companyId === 'string' ? body.companyId : null
    )
    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }

    const data: {
      completedStages?: string[]
      started?: boolean
      exited?: boolean
      progress?: number
      updatedBy: string
    } = { updatedBy: user.userId }

    if ('completedStages' in body) data.completedStages = sanitizeStages(body.completedStages)
    if (typeof body.started === 'boolean') data.started = body.started
    if (typeof body.exited === 'boolean') data.exited = body.exited
    if (typeof body.progress === 'number' && Number.isFinite(body.progress)) {
      data.progress = Math.max(0, Math.min(100, Math.round(body.progress)))
    }

    const state = await prisma.guidedSetupState.upsert({
      where: { companyId },
      update: data,
      create: {
        companyId,
        completedStages: data.completedStages ?? [],
        started: data.started ?? true,
        exited: data.exited ?? false,
        progress: data.progress ?? 0,
        updatedBy: user.userId,
      },
    })

    return withCors(ApiResponse.success({ data: state }, 'Guided setup state saved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
