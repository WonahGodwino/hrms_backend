// src/app/api/companies/[id]/export/route.ts
//
// POST: starts a "Company Export" job for one company. Responds as soon as
// the CompanyExportJob row exists (fast) and generates the actual .xlsx in
// the background — same respond-immediately-then-poll pattern already used
// by staff bulk-edit/payroll uploads and Payroll Generation.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'
import { EXPORT_DOMAINS, isExportDomain, generateCompanyExport } from '@/app/lib/companies/export-company-data'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = params.id
    const hasAccess = await validateCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to export this company', 403), origin)
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) {
      return withCors(ApiResponse.error('Company not found', 404), origin)
    }

    const body = await request.json().catch(() => ({}))
    const domains: unknown[] = Array.isArray(body.domains) ? body.domains : []
    const validDomains = domains.filter(isExportDomain)

    if (validDomains.length === 0) {
      return withCors(
        ApiResponse.error(`At least one domain is required. Choose from: ${EXPORT_DOMAINS.join(', ')}`, 400),
        origin
      )
    }

    const includeSensitiveData = body.includeSensitiveData === true
    let attendanceFrom: Date | null = null
    let attendanceTo: Date | null = null

    if (validDomains.includes('attendance')) {
      if (!body.attendanceFrom || !body.attendanceTo) {
        return withCors(ApiResponse.error('A date range (attendanceFrom, attendanceTo) is required when exporting Attendance', 400), origin)
      }
      attendanceFrom = new Date(body.attendanceFrom)
      attendanceTo = new Date(body.attendanceTo)
      if (isNaN(attendanceFrom.getTime()) || isNaN(attendanceTo.getTime())) {
        return withCors(ApiResponse.error('Invalid attendance date range', 400), origin)
      }
    }

    // One export in flight per company at a time — same guard staff
    // bulk-edit uploads use, so a second click can't race a partially
    // generated file.
    const activeJob = await prisma.companyExportJob.findFirst({ where: { companyId, status: 'PROCESSING' } })
    if (activeJob) {
      return withCors(
        ApiResponse.error('An export is already being generated for this company. Please wait for it to finish before starting another.', 409),
        origin
      )
    }

    const job = await prisma.companyExportJob.create({
      data: {
        companyId,
        requestedBy: user.userId,
        domains: validDomains,
        includeSensitiveData,
        attendanceFrom,
        attendanceTo,
        status: 'PROCESSING'
      }
    })

    // Respond immediately; the export continues generating after the
    // response is sent (long-running Node server, not serverless).
    generateCompanyExport(job.id).catch((err) => {
      console.error('[COMPANY_EXPORT] Unhandled background processing error:', err)
    })

    return withCors(ApiResponse.success({ jobId: job.id, status: 'PROCESSING' }, 'Company export started'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
