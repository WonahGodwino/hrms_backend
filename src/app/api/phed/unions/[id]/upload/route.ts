import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseMembershipCsv } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/unions/:id/upload
// Bulk-assigns staff members to a union from a CSV or Excel file.
// This is an additive operation — staff already in the union are silently skipped.
// The file must have a "Staff ID" column (other columns are ignored).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    // ── Verify the union exists and is active ─────────────────
    const union = await (prisma as any).phedUnion.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, name: true, isActive: true },
    })
    if (!union)          return withCors(ApiResponse.notFound('Union not found'), origin)
    if (!union.isActive) return withCors(ApiResponse.error('Union is inactive', 400), origin)

    // ── Parse uploaded file ───────────────────────────────────
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'csv'
    if (!['csv', 'xlsx', 'xls'].includes(ext))
      return withCors(ApiResponse.error('Only CSV or Excel files are accepted', 400), origin)

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors: parseErrors } = await parseMembershipCsv(buffer, ext)

    if (rows.length === 0)
      return withCors(
        ApiResponse.error(
          parseErrors.length > 0 ? parseErrors[0] : 'No valid staff IDs found in file',
          400
        ),
        origin
      )

    // ── Build staff lookup map (scoped to this union's company) ─
    // Using the union's own companyId ensures a rogue upload cannot
    // reference staff from a different company.
    const allStaff = await (prisma as any).phedStaff.findMany({
      where:  { companyId: union.companyId, isActive: true },
      select: { id: true, staffId: true },
    })
    const staffMap = new Map<string, string>(
      allStaff.map((s: any) => [s.staffId.toLowerCase(), s.id as string])
    )

    // ── Fetch existing memberships to avoid duplicate errors ──
    const existingMembers = await (prisma as any).phedStaffUnion.findMany({
      where:  { unionId: params.id },
      select: { staffId: true },
    })
    const existingSet = new Set<string>(existingMembers.map((m: any) => m.staffId as string))

    // ── Process rows ─────────────────────────────────────────
    let added   = 0
    let skipped = 0   // already a member
    let failed  = 0
    const errors: string[] = [...parseErrors]

    // Bounded-concurrency create so a large member file doesn't time out.
    const CONCURRENCY = 10
    for (let start = 0; start < rows.length; start += CONCURRENCY) {
      const chunk = rows.slice(start, start + CONCURRENCY)
      await Promise.all(chunk.map(async (row) => {
        const dbId = staffMap.get(row.staffId.toLowerCase())

        if (!dbId) {
          failed++
          errors.push(`Staff ID "${row.staffId}" not found in the system`)
          return
        }

        if (existingSet.has(dbId)) {
          skipped++   // already a member — not an error
          return
        }

        try {
          await (prisma as any).phedStaffUnion.create({
            data: { staffId: dbId, unionId: params.id },
          })
          existingSet.add(dbId)   // prevent duplicate within the same upload
          added++
        } catch (err: any) {
          // Catch race-condition duplicates gracefully
          if (err.code === 'P2002') {
            skipped++
          } else {
            failed++
            errors.push(`Staff ID "${row.staffId}": ${err.message}`)
          }
        }
      }))
    }

    // ── Audit trail ───────────────────────────────────────────
    await (prisma as any).phedBulkUpload.create({
      data: {
        companyId:    union.companyId,
        type:         'UNION_MEMBERS',
        fileName:     file.name,
        totalRecords: rows.length,
        successful:   added,
        failed:       failed + skipped,
        errors:       errors.length > 0 ? errors : undefined,
        uploadedBy:   user.userId,
      },
    })

    return withCors(
      ApiResponse.success(
        { added, skipped, failed, errors },
        `${added} member(s) added to ${union.name}` +
        (skipped > 0 ? `, ${skipped} already member(s) skipped` : '') +
        (failed  > 0 ? `, ${failed} failed` : '')
      ),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

