# 247HR backend (API)

ISURFHR automates HR processes: recruitment, onboarding, employee records, leave approvals, payroll, appraisal, and task
assignment and tracking.

This folder is the API: a Next.js 15 project that only serves `/api` routes. Setup, environment variables and the full
list of checks are in the [root README](../README.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API on http://localhost:3000 |
| `npm run typecheck` | TypeScript check (8 GB heap); must print nothing |
| `npm run lint` | ESLint, 0 errors and 0 warnings |
| `npm test` | Jest. Never reaches a real database (see `tests/setup-env.ts`) |
| `npm run test:db:prepare` / `npm run test:db` | Migrate and test against the throwaway database in `docker-compose.test.yml` |
| `npm run docs:api` | Regenerate `docs/api/` from the route files |
| `npm run build` | Production build (about 10 minutes, 8 GB heap) |
| `npm run db:seed` | Starter data. Loads `.env.production` first if it exists, so only run it with a local `.env` |

## Layout

| Path | Holds |
|---|---|
| `src/app/api/**/route.ts` | Route handlers only: read the request, call `lib`, return the response |
| `src/app/lib/<area>/` | Everything else: business logic, validation schemas, helpers |
| `src/app/lib/data/tenant.ts` | `forCompany()`: company-scoped database access ([ADR-001](../docs/engineering/adr/ADR-001-company-scoped-data-access.md)) |
| `src/app/lib/http/` | `withAuth()`, `parsePagination()`, `fetchWithTimeout()` |
| `src/app/lib/validation/` | Request body schemas (zod) and `readJsonBody()` |
| `src/app/lib/jobs/` | Durable background jobs (pg-boss), started from `src/instrumentation.ts` |
| `prisma/schema.prisma`, `prisma/migrations/` | Database schema and its migration history |
| `tests/` | Jest tests |
| `scripts/` | One-off maintenance scripts (not linted) |

Conventions for new routes: [API style guide](../docs/engineering/api-style-guide.md). Endpoint list:
[docs/api/endpoints.md](../docs/api/endpoints.md).

Schema changes and migrations are only made when the owner asks for them; deploys apply migrations to production
automatically. See the [migrations runbook](../docs/engineering/runbooks/migrations.md).
