// List pagination (PERF-002, API-003).
//
// Every list endpoint reads `page` (1-based) and a page size, and never returns more
// than its maximum page size, so one request cannot load a whole table. The page size
// parameter keeps the name the endpoint already used (`limit` or `pageSize`), so
// existing clients keep working; new endpoints use `pageSize`.
//
// A missing, non-numeric or out-of-range value falls back to the default (or is
// clamped to the maximum) instead of reaching Prisma as NaN.

export type PageSizeOptions = {
  /** Page size when the client sends none. */
  defaultSize: number
  /** Largest page size the endpoint serves. Set it at or above what its screens ask for. */
  maxSize: number
}

// Page size limits of the priority list endpoints. Each is at or above the largest page
// its screens request (staff pickers ask /staff/records for 1,000 rows at once).
export const PAGE_SIZE_LIMITS = {
  staffRecords: { defaultSize: 50, maxSize: 1000 },
  adminStaff: { defaultSize: 20, maxSize: 500 },
  notifications: { defaultSize: 20, maxSize: 100 },
} as const satisfies Record<string, PageSizeOptions>

export type Pagination = { page: number; pageSize: number; skip: number; take: number }

const positiveInt = (raw: string | number | null | undefined): number | null => {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null
}

/** A page number: an integer of at least 1. */
export function parsePage(raw: string | number | null | undefined): number {
  return positiveInt(raw) ?? 1
}

/** A page size between 1 and maxSize; defaultSize when missing or invalid. */
export function parsePageSize(raw: string | number | null | undefined, { defaultSize, maxSize }: PageSizeOptions): number {
  return Math.min(positiveInt(raw) ?? defaultSize, maxSize)
}

/** Page, page size and the matching Prisma skip / take from a query string. */
export function parsePagination(
  searchParams: URLSearchParams,
  options: PageSizeOptions & { sizeParam?: 'limit' | 'pageSize' },
): Pagination {
  const page = parsePage(searchParams.get('page'))
  const pageSize = parsePageSize(searchParams.get(options.sizeParam ?? 'pageSize'), options)
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}
