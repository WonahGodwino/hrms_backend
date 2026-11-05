// src/app/api/search/route.ts
//
// GET /api/search?q=&companyId= : one request fans out to every record provider the caller's
// role and the company's enabled modules allow. Providers run in parallel with a per-provider
// timeout, so a slow module returns partial results instead of blocking the dialog.
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getEnabledModules } from '@/app/lib/module-access'
import { SEARCH_PROVIDERS, type SearchResult } from '@/app/lib/search/providers'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

const MIN_QUERY = 2
const MAX_QUERY = 80
const PER_PROVIDER = 5
const PROVIDER_TIMEOUT_MS = 800
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000
const MODULE_CACHE_MS = 60_000

const hits = new Map<string, number[]>()
const moduleCache = new Map<string, { at: number; keys: string[] }>()

function rateLimited(userId: string) {
  const now = Date.now()
  const recent = (hits.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(userId, recent)
  return recent.length > RATE_LIMIT
}

async function enabledModulesCached(companyId: string) {
  const cached = moduleCache.get(companyId)
  if (cached && Date.now() - cached.at < MODULE_CACHE_MS) return cached.keys
  const keys = await getEnabledModules(companyId)
  moduleCache.set(companyId, { at: Date.now(), keys })
  return keys
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const user = requireRole(authHeader.replace('Bearer ', ''), ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])
    if (rateLimited(user.userId)) return withCors(ApiResponse.error('Too many searches. Please slow down.', 429), origin)

    const { searchParams } = new URL(request.url)
    const raw = (searchParams.get('q') || '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY)
    if (raw.length < MIN_QUERY) return withCors(ApiResponse.success({ groups: [], timedOut: [] }, 'Query too short'), origin)

    // The active company must be one the caller can actually access.
    const requested = searchParams.get('companyId') || user.companyId
    if (!requested) return withCors(ApiResponse.error('Company context is required', 400), origin)
    const allowed = user.role === 'SUPER_ADMIN' || requested === user.companyId || (user.companyIds || []).includes(requested)
    if (!allowed) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    // "staff john" or "leave pending" narrows the search to one provider.
    let tokens = raw.split(' ')
    const keyword = tokens.length > 1 ? SEARCH_PROVIDERS.find((p) => p.keywords.includes(tokens[0].toLowerCase())) : undefined
    if (keyword) tokens = tokens.slice(1)
    const query = tokens.join(' ')
    const isEmail = query.includes('@')

    const enabled = user.role === 'SUPER_ADMIN' ? null : await enabledModulesCached(requested)
    const providers = SEARCH_PROVIDERS.filter(
      (p) =>
        p.roles.includes(user.role) &&
        (enabled === null || enabled.includes(p.moduleKey)) &&
        (!keyword || p.type === keyword.type) &&
        (!isEmail || p.emailFriendly)
    )

    const ctx = { userId: user.userId, role: user.role, companyId: requested }
    const settled = await Promise.allSettled(providers.map((p) => withTimeout(p.search(ctx, tokens, query, PER_PROVIDER), PROVIDER_TIMEOUT_MS)))

    const groups: { type: string; label: string; results: SearchResult[] }[] = []
    const timedOut: string[] = []
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        if (s.value.length) groups.push({ type: providers[i].type, label: providers[i].label, results: s.value })
      } else {
        timedOut.push(providers[i].label)
      }
    })

    const response = await withCors(ApiResponse.success({ groups, timedOut }, 'Search complete'), origin)
    response.headers.set('Cache-Control', 'private, max-age=30')
    return response
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
