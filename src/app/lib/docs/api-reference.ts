// Generated API reference (DOC-003).
//
// Builds an OpenAPI 3.1 description and a Markdown endpoint index from the route files
// themselves, so the reference cannot drift from the code:
//   - every `src/app/api/**/route.ts` becomes a path, with the HTTP methods it exports;
//   - a handler that reads its body with readJsonBody(request, schema) gets that zod schema
//     as its request body (API-002), converted to JSON Schema.
// Run `npm run docs:api` after adding or changing a route; tests/docs/api-reference.test.ts
// fails when the committed files in docs/api/ are out of date.
import fs from 'node:fs'
import path from 'node:path'
import { z, type ZodType } from 'zod'
import * as authSchemas from '@/app/lib/validation/auth-schemas'
import * as payrollStaffSchemas from '@/app/lib/validation/payroll-staff-schemas'
import * as onboardingPublicSchemas from '@/app/lib/validation/onboarding-public-schemas'
import * as s3MigrationSchemas from '@/app/lib/validation/s3-migration-schemas'

// Every module under lib/validation/ that holds body schemas. Add new ones here.
const SCHEMA_MODULES: Record<string, Record<string, unknown>> = {
  'auth-schemas': authSchemas,
  'payroll-staff-schemas': payrollStaffSchemas,
  'onboarding-public-schemas': onboardingPublicSchemas,
  's3-migration-schemas': s3MigrationSchemas,
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type Method = (typeof METHODS)[number]

export type RouteBody = { schema: string; module: string; required: boolean }
export type RouteInfo = {
  /** URL path, OpenAPI style: /api/staff/{id} */
  path: string
  /** Route file, relative to the backend folder */
  file: string
  area: string
  methods: Method[]
  /** Request body schema per method, when the handler reads it through readJsonBody */
  bodies: Partial<Record<Method, RouteBody>>
}

const toPosix = (p: string) => p.split(path.sep).join('/')

function listRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listRouteFiles(full))
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

/** `admin/staff/[id]/route.ts` -> `/api/admin/staff/{id}`; `[...path]` -> `{path}`; `(group)` segments are dropped. */
export function routePath(relativeFile: string): string {
  const segments = toPosix(relativeFile).split('/').slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => s.replace(/^\[\[?(?:\.\.\.)?([^\]]+)\]\]?$/, '{$1}'))
  return '/api/' + segments.join('/')
}

/** HTTP methods a route file exports, in a fixed order, with the position each handler starts at. */
export function exportedMethods(source: string): { method: Method; at: number }[] {
  const found: { method: Method; at: number }[] = []
  const declared = /export\s+(?:async\s+function|function|const|let)\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  for (const m of source.matchAll(declared)) found.push({ method: m[1] as Method, at: m.index ?? 0 })
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && (METHODS as readonly string[]).includes(name)) found.push({ method: name as Method, at: m.index ?? 0 })
    }
  }
  return found.sort((a, b) => a.at - b.at)
}

/** Which validation schema each handler passes to readJsonBody / readJsonBodyOrEmpty. */
export function bodySchemas(source: string, handlers: { method: Method; at: number }[]): Partial<Record<Method, RouteBody>> {
  const moduleOf = new Map<string, string>()
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@\/app\/lib\/validation\/([a-z0-9-]+)['"]/g)) {
    if (m[2] === 'request-body') continue
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) moduleOf.set(name, m[2])
  }
  const bodies: Partial<Record<Method, RouteBody>> = {}
  for (const m of source.matchAll(/readJsonBody(OrEmpty)?\(\s*\w+\s*,\s*(\w+)\s*\)/g)) {
    const at = m.index ?? 0
    const owner = handlers.filter((h) => h.at <= at).pop()
    const module = moduleOf.get(m[2])
    if (!owner || !module || bodies[owner.method]) continue
    bodies[owner.method] = { schema: m[2], module, required: !m[1] }
  }
  return bodies
}

export function collectRoutes(backendDir: string): RouteInfo[] {
  const apiDir = path.join(backendDir, 'src', 'app', 'api')
  return listRouteFiles(apiDir)
    .map((file) => path.relative(apiDir, file))
    // Generated at build time and not part of the source tree (see the backend build script).
    .filter((rel) => !toPosix(rel).startsWith('engine/'))
    .map((rel) => {
      const source = fs.readFileSync(path.join(apiDir, rel), 'utf8')
      const handlers = exportedMethods(source)
      return {
        path: routePath(rel),
        file: 'src/app/api/' + toPosix(rel),
        area: toPosix(rel).split('/')[0].replace(/^route\.ts$/, '(root)'),
        methods: [...new Set(handlers.map((h) => h.method))].sort((a, b) => METHODS.indexOf(a) - METHODS.indexOf(b)),
        bodies: bodySchemas(source, handlers),
      }
    })
    .filter((r) => r.methods.length > 0)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

function schemaJson(body: RouteBody): unknown {
  const schema = SCHEMA_MODULES[body.module]?.[body.schema]
  if (!(schema instanceof z.ZodType)) {
    throw new Error(`Body schema ${body.schema} from lib/validation/${body.module} is not registered in SCHEMA_MODULES (lib/docs/api-reference.ts)`)
  }
  // OpenAPI 3.1 already declares the JSON Schema dialect; drop the per-schema $schema key.
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema as ZodType, { io: 'input', unrepresentable: 'any' })
  return json
}

export function buildOpenApi(routes: RouteInfo[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of routes) {
    const ops: Record<string, unknown> = {}
    for (const method of r.methods) {
      const body = r.bodies[method]
      const params = [...r.path.matchAll(/\{([^}]+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }))
      ops[method.toLowerCase()] = {
        tags: [r.area],
        operationId: `${method.toLowerCase()} ${r.path}`,
        'x-source': r.file,
        ...(params.length ? { parameters: params } : {}),
        ...(body ? { requestBody: { required: body.required, content: { 'application/json': { schema: schemaJson(body) } } } } : {}),
        responses: {
          default: { description: 'ApiResponse envelope (see docs/engineering/api-style-guide.md)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      }
    }
    paths[r.path] = ops
  }
  return {
    openapi: '3.1.0',
    info: {
      title: '247HR API',
      version: 'v1',
      description: 'Generated from backend/src/app/api by `npm run docs:api` (DOC-003). Do not edit by hand. Request bodies are listed for routes that validate them with a schema (API-002).',
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        ApiResponse: {
          type: 'object',
          required: ['success', 'message'],
          properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: {}, errors: { type: 'array', items: {} } },
        },
      },
    },
    security: [{ bearer: [] }],
    paths,
  }
}

export function buildMarkdownIndex(routes: RouteInfo[]): string {
  const areas = [...new Set(routes.map((r) => r.area))].sort()
  const operations = routes.reduce((n, r) => n + r.methods.length, 0)
  const validated = routes.reduce((n, r) => n + Object.keys(r.bodies).length, 0)
  const lines = [
    '# API endpoint index',
    '',
    'Generated from `backend/src/app/api` by `npm run docs:api` (DOC-003). Do not edit by hand.',
    '',
    `${routes.length} route files, ${operations} operations, ${validated} with a schema-validated JSON body. The machine-readable`,
    'version, with the body schemas, is [openapi.json](openapi.json). Conventions: [API style guide](../engineering/api-style-guide.md).',
    '',
    '## Areas',
    '',
    areas.map((a) => `[${a}](#${a.toLowerCase().replace(/[^a-z0-9-]/g, '')})`).join(' · '),
    '',
  ]
  for (const area of areas) {
    lines.push(`## ${area}`, '', '| Methods | Path | Validated body |', '|---|---|---|')
    for (const r of routes.filter((x) => x.area === area)) {
      const bodies = Object.entries(r.bodies).map(([m, b]) => `${m}: \`${b.schema}\``).join(', ')
      lines.push(`| ${r.methods.join(' ')} | \`${r.path}\` | ${bodies} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** The generated files, keyed by their path relative to the repository root. */
export function buildApiReference(backendDir: string): Record<string, string> {
  const routes = collectRoutes(backendDir)
  return {
    'docs/api/openapi.json': JSON.stringify(buildOpenApi(routes), null, 2) + '\n',
    'docs/api/endpoints.md': buildMarkdownIndex(routes),
  }
}
