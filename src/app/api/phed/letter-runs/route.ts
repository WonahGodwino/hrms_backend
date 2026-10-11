import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterAuditAccess, requireLetterOperatorAccess } from '@/app/lib/phed/letter-access'
import { parseTemplateWorkbook } from '@/app/lib/phed/letter-workbook'
import { validateAndRender } from '@/app/lib/phed/letter-engine/merge-engine'
import {
  auditLetterEvent, cleanupExpiredLetterFiles, clientIp, getOrSeedTemplate, resolveLetterCompany, resumeStuckLetterRuns, runProgress, templateToConfig,
} from '@/app/lib/phed/letter-service'
import { writeRunFile } from '@/app/lib/phed/letter-storage'
import type { RunInputs } from '@/app/lib/phed/letter-engine/types'

const MAX_ROWS = 1000
const MAX_FILE_BYTES = 10 * 1024 * 1024

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET — run history (Operator sees own runs; Admin/Super/Auditor see all in company)
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterAuditAccess(token)
    cleanupExpiredLetterFiles().catch((e) => console.warn('[letter] cleanup sweep failed:', e))
    resumeStuckLetterRuns().catch((e) => console.warn('[letter] resume sweep failed:', e))
    const companyId = resolveLetterCompany(user, new URL(req.url).searchParams.get('companyId'))
    if (!companyId) return withCors(ApiResponse.forbidden('No company in scope'), origin)

    const isHrOperator = user.role === 'HR'
    const runs = await (prisma as any).phedLetterRun.findMany({
      where: { companyId, ...(isHrOperator ? { operatorId: user.userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, status: true, sourceFileName: true, counts: true, runInputs: true,
        templateVersion: true, createdAt: true, completedAt: true, filesExpireAt: true, operatorId: true,
      },
    })

    return withCors(ApiResponse.success({ runs }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

// POST — upload workbook + run inputs, validate, create run + rows (dry run).
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterOperatorAccess(token)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const companyIdRaw = formData.get('companyId') as string | null
    const runInputsRaw = formData.get('runInputs') as string | null

    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)
    if (!runInputsRaw) return withCors(ApiResponse.error('runInputs is required', 400), origin)

    const companyId = resolveLetterCompany(user, companyIdRaw)
    if (!companyId) return withCors(ApiResponse.forbidden('No company in scope'), origin)

    // V-03 — file type and size
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext !== 'xlsx') {
      return withCors(ApiResponse.error('Only .xlsx files are supported. .xlsm and macro-enabled files are rejected.', 400), origin)
    }
    if (file.size > MAX_FILE_BYTES) {
      return withCors(ApiResponse.error('File is larger than 10 MB.', 400), origin)
    }

    let runInputs: RunInputs
    try {
      runInputs = JSON.parse(runInputsRaw)
    } catch {
      return withCors(ApiResponse.error('runInputs must be valid JSON.', 400), origin)
    }
    if (!runInputs || typeof runInputs !== 'object' || Array.isArray(runInputs)) {
      return withCors(ApiResponse.error('runInputs must be a JSON object.', 400), origin)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let parsed: Awaited<ReturnType<typeof parseTemplateWorkbook>>
    try {
      parsed = await parseTemplateWorkbook(buffer, MAX_ROWS)
    } catch {
      return withCors(ApiResponse.error('Could not read the workbook — it may be corrupt or password-protected. Upload a valid .xlsx file.', 400), origin)
    }

    if (parsed.fatal.length > 0) {
      return withCors(ApiResponse.error(parsed.fatal[0].message, 400, undefined, { findings: parsed.fatal }), origin)
    }
    if (parsed.dataRowCount > MAX_ROWS) {
      return withCors(ApiResponse.error(`Too many data rows: ${parsed.dataRowCount} (limit is ${MAX_ROWS}).`, 400), origin)
    }
    if (parsed.rows.length === 0) {
      return withCors(ApiResponse.error('No staff rows found — the Template sheet has no data rows.', 400), origin)
    }

    const template = await getOrSeedTemplate(companyId, user.userId)
    const result = validateAndRender(parsed.rows, runInputs, templateToConfig(template))

    if (result.fatal.length > 0) {
      return withCors(ApiResponse.error(result.fatal[0].message, 400, undefined, { findings: result.fatal }), origin)
    }

    const sha256 = createHash('sha256').update(buffer).digest('hex')
    const prior = await (prisma as any).phedLetterRun.findFirst({
      where: { companyId, sourceFileSha256: sha256 },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, operatorId: true },
    })
    const run = await (prisma as any).phedLetterRun.create({
      data: {
        companyId,
        operatorId: user.userId,
        sourceFileName: file.name,
        sourceFileSize: file.size,
        sourceFileSha256: sha256,
        runInputs: runInputs,
        templateId: template.id,
        templateVersion: template.version,
        status: 'AWAITING_CONFIRMATION',
        counts: result.counts,
      },
    })

    for (const row of result.rows) {
      await (prisma as any).phedLetterRunRow.create({
        data: {
          runId: run.id,
          companyId,
          excelRow: row.excelRow,
          employeeId: row.employeeId,
          values: { renderModel: row.renderModel, wordsAutoGenerated: row.wordsAutoGenerated },
          findings: row.findings,
          status: row.renderModel ? 'PENDING' : 'EXCLUDED',
        },
      })
    }

    // Persist the source workbook (purged with the run on expiry).
    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120) || 'source.xlsx'
    const sourceStorageKey = writeRunFile(companyId, run.id, `source_${safeName}`, buffer)
    await (prisma as any).phedLetterRun.update({ where: { id: run.id }, data: { storageKey: sourceStorageKey } })

    await auditLetterEvent(companyId, user.userId, 'UPLOAD_VALIDATE', run.id,
      `${file.name} — ${result.counts.valid} valid, ${result.counts.excluded} excluded, ${result.counts.warnings} warnings`, clientIp(req.headers))
    if (prior) {
      await auditLetterEvent(companyId, user.userId, 'DUPLICATE_UPLOAD', run.id,
        `Same workbook SHA-256 as run ${prior.id} from ${prior.createdAt}`, clientIp(req.headers))
    }

    return withCors(ApiResponse.success({
      runId: run.id,
      status: run.status,
      counts: result.counts,
      extraColumns: parsed.extraColumns,
      duplicate: prior ? { runId: prior.id, createdAt: prior.createdAt, operatorId: prior.operatorId } : null,
    }, 'Workbook uploaded and validated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
