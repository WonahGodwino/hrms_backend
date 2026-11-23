import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseConfigCsv } from '@/app/lib/phed/csv-parser'
import { rejectForeignCompany } from '@/app/lib/phed/company-guard'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/feeders/upload
// Bulk-creates feeders from a CSV/Excel file (the downloaded template).
// Upsert by name: an existing feeder is updated; a new one is created.
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
    const foreignCompany = await rejectForeignCompany(user, companyId, origin)
    if (foreignCompany) return foreignCompany
    if (!file)      return withCors(ApiResponse.error('file is required', 400), origin)
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'csv'
    if (!['csv', 'xlsx', 'xls'].includes(ext))
      return withCors(ApiResponse.error('Only CSV or Excel files are supported', 400), origin)

    const buffer = Buffer.from(await file.arrayBuffer())
    const rows   = await parseConfigCsv(buffer, ext)

    if (rows.length === 0)
      return withCors(ApiResponse.error('No rows found in file — ensure data starts at row 3', 400), origin)

    const regions = await forCompany(companyId).phedRegion.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    })
    const regionMap = new Map<string, string>(
      regions.map((r: any) => [r.name.toLowerCase(), r.id as string])
    )

    let created = 0
    let updated = 0
    let failed  = 0
    const errors: string[] = []

    for (const r of rows) {
      const name   = (r['feedername'] || r['feeder'] || r['name'] || '').trim()
      const region = (r['region'] || r['regionname'] || '').trim()
      const code   = (r['code'] || '').trim() || null
      if (!name)   { failed++; errors.push('A row is missing the Feeder Name'); continue }

      const regionId = region ? (regionMap.get(region.toLowerCase()) ?? null) : null
      if (!regionId) { failed++; errors.push(`Feeder "${name}": region "${region}" not found in the system`); continue }

      try {
        const existing = await forCompany(companyId).phedFeeder.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        })
        if (existing) {
          await prisma.phedFeeder.update({
            where: { id: existing.id },
            data: { regionId, ...(code ? { code } : {}) },
          })
          updated++
        } else {
          await prisma.phedFeeder.create({ data: { companyId, regionId, name, code } })
          created++
        }
      } catch (e: any) {
        failed++
        errors.push(`Feeder "${name}": ${e?.message || 'failed'}`)
      }
    }

    await prisma.phedBulkUpload.create({
      data: {
        companyId,
        type:         'FEEDERS',
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
