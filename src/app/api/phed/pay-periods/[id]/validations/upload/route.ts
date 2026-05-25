import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseValidationCsv } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (!['VALIDATION_OPEN', 'VALIDATION_CLOSED'].includes(period.status))
      return withCors(ApiResponse.error('Validation uploads only allowed during validation phase', 400), origin)

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    const ext    = file.name.split('.').pop()?.toLowerCase() || 'csv'
    const buffer = Buffer.from(await file.arrayBuffer())

    console.log(`[VALIDATION UPLOAD] file="${file.name}" ext="${ext}" size=${buffer.length} periodId=${params.id}`)

    const { rows, errors: parseErrors } = await parseValidationCsv(buffer, ext)

    console.log(`[VALIDATION UPLOAD] parsed ${rows.length} rows, ${parseErrors.length} parse errors`)
    if (parseErrors.length) console.log(`[VALIDATION UPLOAD] parse errors:`, parseErrors)
    if (rows.length)        console.log(`[VALIDATION UPLOAD] first parsed row:`, rows[0])

    // No valid rows at all — return immediately with a clear error
    if (rows.length === 0) {
      return withCors(
        ApiResponse.error(
          parseErrors.length > 0
            ? `File could not be parsed. Check your column headers (staffId, status, reason) and try again. Errors: ${parseErrors.slice(0, 3).join('; ')}`
            : 'No data rows found in file',
          400
        ),
        origin
      )
    }

    // Build staffId code → phedStaff DB id map (scoped to this company)
    const allStaff  = await (prisma as any).phedStaff.findMany({
      where:  { companyId: period.companyId },
      select: { id: true, staffId: true },
    })
    const staffMap = new Map<string, string>(
      allStaff.map((s: any) => [s.staffId.toLowerCase(), s.id as string])
    )

    console.log(`[VALIDATION UPLOAD] staffMap has ${staffMap.size} entries`)
    console.log(`[VALIDATION UPLOAD] looking up staffId="${rows[0]?.staffId}" → dbId="${staffMap.get(rows[0]?.staffId?.toLowerCase())}"`)

    let successful = 0
    let failed     = 0
    const errors: string[] = [...parseErrors]

    for (const row of rows) {
      const dbId = staffMap.get(row.staffId.toLowerCase())
      if (!dbId) {
        failed++
        errors.push(`Staff ID "${row.staffId}" not found in this company's staff list`)
        console.warn(`[VALIDATION UPLOAD] staff not found: "${row.staffId}"`)
        continue
      }

      try {
        await (prisma as any).phedValidation.upsert({
          where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: dbId } },
          create: {
            payPeriodId: params.id,
            staffId:     dbId,
            companyId:   period.companyId,
            status:      row.status,
            reason:      row.reason || null,
            validatedBy: user.userId,
            validatedAt: new Date(),
          },
          update: {
            status:      row.status,
            reason:      row.reason || null,
            validatedBy: user.userId,
            validatedAt: new Date(),
          },
        })
        console.log(`[VALIDATION UPLOAD] ✓ upserted staffId="${row.staffId}" dbId="${dbId}" status="${row.status}"`)
        successful++
      } catch (err: any) {
        failed++
        errors.push(`Staff ${row.staffId}: ${err.message}`)
        console.error(`[VALIDATION UPLOAD] ✗ upsert failed staffId="${row.staffId}":`, err.message)
      }
    }

    await (prisma as any).phedBulkUpload.create({
      data: {
        companyId:    period.companyId,
        payPeriodId:  params.id,
        type:         'VALIDATION',
        fileName:     file.name,
        totalRecords: rows.length,
        successful,
        failed,
        errors:       errors.length > 0 ? errors : undefined,
        uploadedBy:   user.userId,
      },
    })

    console.log(`[VALIDATION UPLOAD] done: successful=${successful} failed=${failed}`)

    if (successful === 0)
      return withCors(
        ApiResponse.error(`0 records updated. ${errors.length} error(s): ${errors.slice(0, 3).join('; ')}`, 400),
        origin
      )

    const message = failed > 0
      ? `${successful} updated, ${failed} failed — check errors for details`
      : `${successful} validation(s) updated successfully`

    return withCors(ApiResponse.success({ successful, failed, errors }, message), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

