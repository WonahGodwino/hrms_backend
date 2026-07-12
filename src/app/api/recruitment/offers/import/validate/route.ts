// POST /api/recruitment/offers/import/validate
// Parses an uploaded bulk-offer file and returns a validation preview WITHOUT
// writing anything to the database.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { parseOfferImportFile, EMAIL_RE } from '@/app/lib/offers/bulk-import-helpers'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    let rows
    try {
      rows = await parseOfferImportFile(file)
    } catch (e: any) {
      return withCors(ApiResponse.error(e?.message || 'Unable to read the uploaded file', 400), origin)
    }

    // Preload the company's designations so we can resolve each row's designation
    // by either its code or its id in one query.
    const designations = await (prisma as any).designation.findMany({
      where: { companyId },
      select: { id: true, code: true },
    })
    const designationKeys = new Set<string>()
    for (const d of designations) {
      if (d.id) designationKeys.add(String(d.id).toLowerCase())
      if (d.code) designationKeys.add(String(d.code).toLowerCase())
    }

    // Preload the company's jobs so a supplied Job ID can be mapped to a real
    // requisition (also accept a job title as a friendly fallback).
    const jobs = await prisma.job.findMany({
      where: { companyId, archived: 0 },
      select: { id: true, title: true },
    })
    const jobKeys = new Set<string>()
    for (const j of jobs) {
      if (j.id) jobKeys.add(String(j.id).toLowerCase())
      if (j.title) jobKeys.add(String(j.title).toLowerCase())
    }

    const seenEmails = new Set<string>()
    let validCount = 0
    let errorCount = 0

    const preview = rows.map((row) => {
      const errors: string[] = []

      if (!row.candidateName) errors.push('Missing Name')
      if (!row.email) errors.push('Missing Email')
      else if (!EMAIL_RE.test(row.email)) errors.push('Invalid Email')

      if (!row.designationId) errors.push('Missing Designation')
      else if (!designationKeys.has(row.designationId.toLowerCase())) errors.push('Unknown Designation')

      // Job ID is optional, but when supplied it must map to a real requisition.
      // If it doesn't, the user must create the job before importing its offers.
      if (row.jobId && !jobKeys.has(row.jobId.toLowerCase()))
        errors.push(`Job "${row.jobId}" not found — create this job before uploading offers for it`)

      if (row.email) {
        if (seenEmails.has(row.email)) errors.push('Duplicate Row')
        else seenEmails.add(row.email)
      }

      const isValid = errors.length === 0
      if (isValid) validCount++
      else errorCount++

      return {
        candidateName: row.candidateName || '—',
        email: row.email || '-',
        jobId: row.jobId || '-',
        designationId: row.designationId || '-',
        anticipatedStartDate: row.anticipatedStartDate,
        offerExpirationDate: row.offerExpirationDate,
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
