// POST /api/business-units/import/validate  (multipart: file)
// Parses + validates a Business Unit CSV, stashes the ready rows in a short-lived
// session and returns a preview. Returns: { sessionId, totalRows, validCount,
// errorCount, preview: [{ name, code, costCenter, status, type }] }
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveBUCompanyId } from '@/app/lib/business-units/bu-utils'
import { signImportToken, PendingBURow } from '@/app/lib/business-units/import-token'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// Cap the batch so the signed token (which carries the validated rows) stays a
// sane size. Business units are few in practice; this also bounds abuse.
const MAX_IMPORT_ROWS = 500

// Minimal CSV row splitter that respects double-quoted fields.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const scope = await resolveBUCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('File is required', 400), origin)

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) return withCors(ApiResponse.error('CSV must have a header row and at least one data row', 400), origin)
    if (lines.length - 1 > MAX_IMPORT_ROWS) {
      return withCors(ApiResponse.error(`Too many rows: import up to ${MAX_IMPORT_ROWS} business units per file`, 400), origin)
    }

    const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/"/g, ''))
    const idx = {
      name: headers.findIndex((h) => h === 'name'),
      code: headers.findIndex((h) => h === 'code'),
      costCenter: headers.findIndex((h) => h === 'costcenter' || h === 'cost center'),
      description: headers.findIndex((h) => h === 'description'),
    }
    if (idx.name === -1) return withCors(ApiResponse.error('CSV must include a "Name" column', 400), origin)

    // Existing names/codes for duplicate detection.
    const existing = await (prisma as any).businessUnit.findMany({
      where: { companyId, archived: 0 },
      select: { name: true, code: true },
    })
    const existingNames = new Set(existing.map((e: any) => (e.name || '').toLowerCase()))
    const existingCodes = new Set(existing.filter((e: any) => e.code).map((e: any) => e.code.toLowerCase()))

    const seenNames = new Set<string>()
    const seenCodes = new Set<string>()
    const preview: any[] = []
    const ready: PendingBURow[] = []
    let validCount = 0
    let errorCount = 0

    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line).map((c) => c.replace(/"/g, ''))
      const name = (idx.name >= 0 ? cols[idx.name] : '') || ''
      const code = (idx.code >= 0 ? cols[idx.code] : '') || ''
      const costCenter = (idx.costCenter >= 0 ? cols[idx.costCenter] : '') || ''
      const description = (idx.description >= 0 ? cols[idx.description] : '') || ''

      const errors: string[] = []
      if (!name.trim()) errors.push('Missing name')
      const nameKey = name.trim().toLowerCase()
      const codeKey = code.trim().toLowerCase()
      if (nameKey && (existingNames.has(nameKey) || seenNames.has(nameKey))) errors.push('Duplicate name')
      if (codeKey && (existingCodes.has(codeKey) || seenCodes.has(codeKey))) errors.push('Duplicate code')

      if (errors.length) {
        errorCount++
        preview.push({ name: name || '—', code: code || '—', costCenter: costCenter || '—', status: errors.join(', '), type: 'error' })
      } else {
        validCount++
        seenNames.add(nameKey)
        if (codeKey) seenCodes.add(codeKey)
        ready.push({
          name: name.trim(),
          code: code.trim() || null,
          costCenter: costCenter.trim() || null,
          description: description.trim() || null,
        })
        preview.push({ name: name.trim(), code: code.trim() || '—', costCenter: costCenter.trim() || '—', status: 'Ready', type: 'valid' })
      }
    }

    // Stateless: the validated rows travel back to the client inside a signed,
    // short-lived token (returned as `sessionId` to match the frontend contract).
    const sessionId = signImportToken(companyId, user.userId, ready)

    return withCors(ApiResponse.success({
      sessionId,
      totalRows: lines.length - 1,
      validCount,
      errorCount,
      preview,
    }, 'Validation complete'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
