// Request body validation (API-002).
//
// Routes read their JSON body through readJsonBody(request, schema) instead of
// `await request.json()` plus hand-written checks. A body that is not JSON, or
// does not match the schema, comes back as { ok: false } with a message and the
// list of problems, so the route can answer 400 instead of failing later with a
// 500 (for example calling .toLowerCase() on a number).
import type { ZodType } from 'zod'

export type BodyIssue = { path: string; message: string }

export type BodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; issues: BodyIssue[] }

export async function readJsonBody<T>(request: Request, schema: ZodType<T>): Promise<BodyResult<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch (_e) {
    return { ok: false, message: 'Request body must be valid JSON', issues: [] }
  }
  const parsed = schema.safeParse(raw ?? {})
  if (parsed.success) return { ok: true, data: parsed.data }
  const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
  return { ok: false, message: issues[0] ? `${issues[0].path || 'body'}: ${issues[0].message}` : 'Invalid request body', issues }
}

/**
 * For routes that keep their own field checks and messages: the validated body,
 * or an empty object when the body is not JSON or has a field of the wrong
 * type (the route's "is required" checks then answer 400).
 */
export async function readJsonBodyOrEmpty<T extends object>(request: Request, schema: ZodType<T>): Promise<Partial<T>> {
  const result = await readJsonBody(request, schema)
  return result.ok ? result.data : {}
}
