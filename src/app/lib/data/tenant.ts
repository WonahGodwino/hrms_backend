// Company-scoped data access (ARCH-001).
//
// forCompany(companyId) returns the normal Prisma client with one difference:
// every query on a model that has a `companyId` column is limited to that
// company, and every row it creates is stamped with it. A record of another
// company is simply not found, so a route cannot leak or change another
// tenant's data by forgetting a `where: { companyId }`.
//
//   const db = forCompany(user.companyId)
//   const feeder = await db.phedFeeder.findFirst({ where: { id } })   // null if another company's
//
// Models without a companyId column (lookups, global tables) pass through
// unchanged. Nested reads/writes (include, nested create) are not rewritten:
// scope the top-level query and keep nested relations under it. Only model
// calls are scoped: use the plain client for $transaction / raw SQL.
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { scopeArgs } from '@/app/lib/data/tenant-scope'

/** Prisma model names (PascalCase) that carry a scalar `companyId` column. */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'companyId' && f.kind === 'scalar'))
    .map((m) => m.name),
)

// The same models as client property names (staffRecord, phedFeeder, ...).
const TENANT_DELEGATES: ReadonlySet<string> = new Set([...TENANT_MODELS].map((n) => n[0].toLowerCase() + n.slice(1)))

export type CompanyDb = typeof prisma

type AnyFn = (args?: unknown) => unknown

function scopedDelegate(delegate: object, companyId: string): object {
  return new Proxy(delegate, {
    get(target, op, receiver) {
      const value = Reflect.get(target, op, receiver)
      if (typeof op !== 'string' || typeof value !== 'function') return value
      return (args?: Record<string, unknown>) => (value as AnyFn).call(target, scopeArgs(op, args, companyId))
    },
  })
}

function buildScopedClient(companyId: string): CompanyDb {
  const delegates = new Map<string, object>()
  return new Proxy(prisma, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof prop !== 'string' || !TENANT_DELEGATES.has(prop) || !value || typeof value !== 'object') return value
      let scoped = delegates.get(prop)
      if (!scoped) {
        scoped = scopedDelegate(value, companyId)
        delegates.set(prop, scoped)
      }
      return scoped
    },
  })
}

// One scoped client per company, reused across requests.
const cache = new Map<string, CompanyDb>()
const CACHE_LIMIT = 500

/**
 * The Prisma client limited to one company. Throws when companyId is null or
 * undefined (a missing filter would otherwise read every company). An empty
 * string is allowed and matches nothing, exactly like `where: { companyId: '' }`.
 */
export function forCompany(companyId: string | null | undefined): CompanyDb {
  if (companyId === null || companyId === undefined) throw new Error('forCompany: a companyId is required')
  let db = cache.get(companyId)
  if (!db) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
    db = buildScopedClient(companyId)
    cache.set(companyId, db)
  }
  return db
}
