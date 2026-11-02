import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseConfigCsv } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/grades/upload
// Bulk-creates grades from a CSV/Excel file (the downloaded template).
// Upsert by grade code: an existing grade is updated; a new one is created.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null
    if (!file)      return withCors(ApiResponse.error('file is required', 400), origin)
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'csv'
    if (!['csv', 'xlsx', 'xls'].includes(ext))
      return withCors(ApiResponse.error('Only CSV or Excel files are supported', 400), origin)

    const buffer = Buffer.from(await file.arrayBuffer())
    const rows   = await parseConfigCsv(buffer, ext)

    if (rows.length === 0)
      return withCors(ApiResponse.error('No rows found in file — ensure data starts at row 3', 400), origin)

    // Load existing grades so we can upsert by code and auto-assign levelOrder,
    // exactly like the individual "New Grade" dialog (which only exposes
    // Grade Name + Level and defaults category to REGULAR).
    const existingGrades = await (prisma as any).phedGrade.findMany({
      where: { companyId },
      select: { id: true, code: true, name: true, levelOrder: true },
    })
    const existingByCode = new Map<string, any>(
      existingGrades.map((g: any) => [(g.code || '').toLowerCase(), g])
    )
    let nextLevel = existingGrades.reduce((m: number, g: any) => Math.max(m, Number(g.levelOrder) || 0), 0)

    let created = 0
    let updated = 0
    let failed  = 0
    const errors: string[] = []

    for (const r of rows) {
      const name  = (r['gradename'] || r['grade'] || r['name'] || '').trim()
      const level = (r['level'] || r['gradecode'] || r['code'] || r['levelcode'] || '').trim()

      if (!name)  { failed++; errors.push('A row is missing the Grade Name'); continue }
      if (!level) { failed++; errors.push(`Grade "${name}": Level is required`); continue }

      const code = level.toUpperCase()

      try {
        const existing = existingByCode.get(code.toLowerCase())
        if (existing) {
          await (prisma as any).phedGrade.update({
            where: { id: existing.id },
            data: { name },
          })
          updated++
        } else {
          nextLevel += 1
          const newGrade = await (prisma as any).phedGrade.create({
            data: {
              companyId,
              name,
              code,
              category:           'REGULAR',
              levelOrder:         nextLevel,
              defaultBasicSalary: null,
            },
          })
          existingByCode.set(code.toLowerCase(), newGrade)
          created++
        }
      } catch (e: any) {
        failed++
        errors.push(`Grade "${name}": ${e?.message || 'failed'}`)
      }
    }

    await (prisma as any).phedBulkUpload.create({
      data: {
        companyId,
        type:         'GRADES',
        fileName:     file.name,
        totalRecords: rows.length,
        successful:   created + updated,
        failed,
        errors:       errors.length > 0 ? errors : undefined,
        uploadedBy:   user.userId,
      },
    })

    return withCors(ApiResponse.success({ created, updated, failed, errors }, `${created} created, ${updated} updated, ${failed} failed`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
