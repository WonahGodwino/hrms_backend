import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseTaxProfileCsv, normalizeState } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/tax-profiles/upload
// Bulk-sets state of residence (and optional JTB TIN) for PHED staff by upserting
// the core module's EmployeeTaxProfile records. Columns: Staff ID, State of Residence, JTB TIN.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const formData  = await req.formData()
    const companyId = (formData.get('companyId') as string) || user.companyId || ''
    const file      = formData.get('file') as File | null
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (!file)      return withCors(ApiResponse.error('file is required', 400), origin)

    // HR/ADMIN can only upload for their own company; SUPER_ADMIN can use any.
    if (user.role !== 'SUPER_ADMIN' && user.companyId && user.companyId !== companyId) {
      return withCors(ApiResponse.error('You do not have permission to upload tax profiles for this company', 403), origin)
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'csv'
    if (!['csv', 'xlsx', 'xls'].includes(ext))
      return withCors(ApiResponse.error('Only CSV or Excel files are accepted', 400), origin)

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors: parseErrors } = await parseTaxProfileCsv(buffer, ext)

    if (rows.length === 0) {
      return withCors(ApiResponse.error(parseErrors.length ? parseErrors[0] : 'No valid rows found in file', 400), origin)
    }

    const errors: string[] = [...parseErrors]
    let successful = 0

    for (const row of rows) {
      try {
        const state = normalizeState(row.stateOfResidence)
        if (!state) {
          errors.push(`Row for ${row.staffId}: invalid State of Residence "${row.stateOfResidence}" (use Akwa Ibom, Bayelsa, Cross River or Rivers)`)
          continue
        }

        // Every PHED staff has a matching StaffRecord (single-form upsert and bulk
        // upload both provision one), keyed by staffId_companyId.
        const staffRecord = await prisma.staffRecord.findUnique({
          where: { staffId_companyId: { staffId: row.staffId, companyId } },
          select: { id: true },
        })
        if (!staffRecord) {
          errors.push(`Row for ${row.staffId}: no staff record found for this Staff ID`)
          continue
        }

        await prisma.employeeTaxProfile.upsert({
          where: { staffId: staffRecord.id },
          create: {
            staffId: staffRecord.id,
            companyId,
            stateOfResidence: state,
            jtbTin: row.jtbTin ?? null,
            tinVerified: false,
          },
          update: {
            stateOfResidence: state,
            ...(row.jtbTin ? { jtbTin: row.jtbTin } : {}),
          },
        })
        successful += 1
      } catch (e: any) {
        errors.push(`Row for ${row.staffId}: ${e?.message || 'failed'}`)
      }
    }

    // Record upload history (best-effort — history must not fail the upload).
    await prisma.taxProfileUpload.create({
      data: {
        companyId,
        fileName: file.name,
        filePath: '',
        totalRecords: rows.length,
        successful,
        failed: errors.length,
        errors,
        uploadedBy: user.userId,
      },
    }).catch((e: any) => console.error('TaxProfileUpload history write failed:', e?.message))

    return withCors(ApiResponse.success({ successful, failed: errors.length, errors }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
