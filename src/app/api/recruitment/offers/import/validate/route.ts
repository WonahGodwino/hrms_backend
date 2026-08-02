// POST /api/recruitment/offers/import/validate
// Parses an uploaded bulk-offer file and returns a validation preview WITHOUT
// writing anything to the database.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { parseOfferImportFile, EMAIL_RE, parseApprovalFlag } from '@/app/lib/offers/bulk-import-helpers'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    // companyId from the global company selector — required for ADMIN/SUPER_ADMIN.
    const companyId = searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId query parameter is required — select a company from the global selector', 400), origin)

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    let rows
    try {
      rows = await parseOfferImportFile(file)
    } catch (e: any) {
      return withCors(ApiResponse.error(e?.message || 'Unable to read the uploaded file', 400), origin)
    }

    // Preload the company's designations so we can resolve each row's position/designation
    // by either its code or its id in one query.
    const designations = await (prisma as any).designation.findMany({
      where: { companyId },
      select: { id: true, code: true, title: true },
    })
    const designationKeys = new Set<string>()
    const designationTitleKeys = new Set<string>()
    for (const d of designations) {
      if (d.id) designationKeys.add(String(d.id).toLowerCase())
      if (d.code) designationKeys.add(String(d.code).toLowerCase())
      if (d.title) designationTitleKeys.add(String(d.title).toLowerCase())
    }

    // Preload the company's jobs so a supplied Job ID or position can be mapped
    const jobs = await prisma.job.findMany({
      where: { companyId, archived: 0 },
      select: { id: true, title: true },
    })
    const jobKeys = new Set<string>()
    const jobTitleKeys = new Set<string>()
    for (const j of jobs) {
      if (j.id) jobKeys.add(String(j.id).toLowerCase())
      if (j.title) jobTitleKeys.add(String(j.title).toLowerCase())
    }

    const seenEmails = new Set<string>()
    let validCount = 0
    let errorCount = 0

    const preview = rows.map((row) => {
      const errors: string[] = []

      if (!row.candidateName) errors.push('Missing Name')
      if (!row.email) errors.push('Missing Email')
      else if (!EMAIL_RE.test(row.email)) errors.push('Invalid Email')

      // Position can match against designation (code/id/title) or job (id/title)
      const pos = (row.position || row.designationId || row.jobId || '').toLowerCase()
      if (!pos) errors.push('Missing Position/Designation')
      else if (
        !designationKeys.has(pos) &&
        !designationTitleKeys.has(pos) &&
        !jobKeys.has(pos) &&
        !jobTitleKeys.has(pos)
      ) errors.push('Unknown Position/Designation')

      if (row.email) {
        if (seenEmails.has(row.email)) errors.push('Duplicate Row')
        else seenEmails.add(row.email)
      }

      // Optional: validate resumption date format
      if (row.resumptionDate || row.anticipatedStartDate) {
        const d = row.resumptionDate || row.anticipatedStartDate
        if (d && isNaN(new Date(d).getTime())) errors.push('Invalid Resumption Date')
      }

      const isValid = errors.length === 0
      if (isValid) validCount++
      else errorCount++

      return {
        candidateName: row.candidateName || '—',
        email: row.email || '-',
        position: row.position || row.designationId || row.jobId || '-',
        country: row.country || '-',
        city: row.city || '-',
        proposedBasicSalary: row.proposedBasicSalary || '-',
        resumptionDate: row.resumptionDate || row.anticipatedStartDate || null,
        requiresApproval: parseApprovalFlag(row.requiresApproval),
        status: isValid ? 'Ready' : errors.join(', '),
        type: isValid ? 'valid' : 'error',
      }
    })

    return withCors(ApiResponse.success({
      totalRows: rows.length,
      validCount,
      errorCount,
      preview,
    }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
