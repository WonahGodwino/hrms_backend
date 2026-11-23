// Pure argument rewriting behind forCompany() (ARCH-001). Kept free of
// Prisma imports so it can be unit-tested on its own.

type Args = Record<string, unknown>

/** Raised when a write names a different company than the scoped one. */
export class TenantScopeError extends Error {
  status = 403
  constructor(message: string) {
    super(message)
    this.name = 'TenantScopeError'
  }
}

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
])

function scopeWhere(where: unknown, companyId: string): Args {
  const w = (where && typeof where === 'object' ? where : {}) as Args
  if (w.companyId !== undefined && w.companyId !== companyId) {
    // An explicit filter for another company: keep both so nothing matches.
    return { AND: [w, { companyId }] }
  }
  return { ...w, companyId }
}

function stampData(data: unknown, companyId: string): unknown {
  if (!data || typeof data !== 'object') return data
  const d = data as Args
  if (d.companyId !== undefined) {
    if (d.companyId !== companyId) throw new TenantScopeError('Cannot write a record for another company')
    return d
  }
  const company = d.company as { connect?: { id?: unknown } } | undefined
  if (company) {
    if (company.connect?.id !== companyId) throw new TenantScopeError('Cannot write a record for another company')
    return d
  }
  return { ...d, companyId }
}

function stampMany(data: unknown, companyId: string): unknown {
  return Array.isArray(data) ? data.map((row) => stampData(row, companyId)) : stampData(data, companyId)
}

/** Returns the arguments of a Prisma operation limited to one company. */
export function scopeArgs(operation: string, args: Args | undefined, companyId: string): Args {
  const next: Args = { ...(args || {}) }
  if (WHERE_OPERATIONS.has(operation)) next.where = scopeWhere(next.where, companyId)
  if (operation === 'create') next.data = stampData(next.data, companyId)
  if (operation === 'createMany' || operation === 'createManyAndReturn') next.data = stampMany(next.data, companyId)
  if (operation === 'upsert') next.create = stampData(next.create, companyId)
  if (operation === 'update' || operation === 'updateMany' || operation === 'upsert') {
    const data = (operation === 'upsert' ? next.update : next.data) as Args | undefined
    if (data && data.companyId !== undefined && data.companyId !== companyId) {
      throw new TenantScopeError('Cannot move a record to another company')
    }
  }
  return next
}
