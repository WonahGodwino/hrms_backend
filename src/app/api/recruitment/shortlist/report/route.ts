// GET /api/recruitment/shortlist/report?jobId=...&format=excel|csv
// Produces a clean, management-ready list of SHORTLISTED candidates for a job —
// the document HR can hand to management before planning the assessment.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().split('T')[0] : ''

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const format = (searchParams.get('format') || 'excel').toLowerCase()

    if (!jobId) {
      return withCors(ApiResponse.error('jobId query parameter is required', 400), origin)
    }

    // Scope to the caller's active company (global switcher), role-enforced.
    const scope = await resolveRecruitmentCompanyId(user, searchParams.get('companyId'))
    if (scope.error) {
      return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    }
    const companyId = scope.companyId as string

    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
      select: { id: true, title: true, department: true, position: true },
    })
    if (!job) {
      return withCors(
        ApiResponse.error('Job not found for this company or you do not have access', 404),
        origin
      )
    }

    const applications = await prisma.jobApplication.findMany({
      where: {
        jobId,
        companyId,
        status: 'SHORTLISTED',
        archived: 0,
      },
      include: {
        candidate: {
          select: { firstName: true, lastName: true, email: true, phone: true, locationState: true },
        },
      },
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
    })

    if (!applications.length) {
      return withCors(
        ApiResponse.error('No shortlisted candidates found for this job', 404),
        origin
      )
    }

    const rows = applications.map((a, i) => ({
      sn: i + 1,
      firstName: a.candidate?.firstName || '',
      lastName: a.candidate?.lastName || '',
      email: a.candidate?.email || '',
      phone: a.candidate?.phone || '',
      location: a.candidate?.locationState || '',
      score: a.score ?? '',
      appliedAt: fmtDate(a.createdAt),
      shortlistedAt: fmtDate(a.reviewedAt || a.updatedAt),
      notes: a.notes || '',
    }))

    if (format === 'csv') {
      return generateCsv(rows, job, origin)
    }
    return generateExcel(rows, job, origin)
  } catch (error) {
    const message = formatError(error)
    console.error('[SHORTLIST_REPORT] Error:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

async function generateExcel(rows: any[], job: any, origin: string | null) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Shortlisted Candidates')

  // Title + context block above the table.
  sheet.mergeCells('A1:I1')
  sheet.getCell('A1').value = `Shortlisted Candidates — ${job.title}`
  sheet.getCell('A1').font = { bold: true, size: 14 }
  sheet.getCell('A2').value = `Department: ${job.department || '—'}   |   Position: ${job.position || '—'}`
  sheet.getCell('A3').value = `Total shortlisted: ${rows.length}   |   Generated: ${new Date().toLocaleString()}`
  sheet.addRow([])

  const headerRowIndex = 5
  const columns = [
    { header: 'S/N', key: 'sn', width: 6 },
    { header: 'First Name', key: 'firstName', width: 18 },
    { header: 'Last Name', key: 'lastName', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Location', key: 'location', width: 16 },
    { header: 'Score', key: 'score', width: 8 },
    { header: 'Applied On', key: 'appliedAt', width: 14 },
    { header: 'Shortlisted On', key: 'shortlistedAt', width: 14 },
    { header: 'Notes', key: 'notes', width: 40 },
  ]

  const headerRow = sheet.getRow(headerRowIndex)
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = col.header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF137FEC' } }
    sheet.getColumn(idx + 1).width = col.width
  })

  rows.forEach((r) => {
    sheet.addRow([
      r.sn, r.firstName, r.lastName, r.email, r.phone,
      r.location, r.score, r.appliedAt, r.shortlistedAt, r.notes,
    ])
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `shortlisted_${slug(job.title)}_${new Date().toISOString().split('T')[0]}.xlsx`
  const response = new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
  return withCors(response, origin)
}

function generateCsv(rows: any[], job: any, origin: string | null) {
  const header = [
    'S/N', 'First Name', 'Last Name', 'Email', 'Phone',
    'Location', 'Score', 'Applied On', 'Shortlisted On', 'Notes',
  ]
  const esc = (v: unknown) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = rows.map((r) =>
    [r.sn, r.firstName, r.lastName, r.email, r.phone, r.location, r.score, r.appliedAt, r.shortlistedAt, r.notes]
      .map(esc)
      .join(',')
  )
  const csv = [header.join(','), ...body].join('\n')
  const filename = `shortlisted_${slug(job.title)}_${new Date().toISOString().split('T')[0]}.csv`
  const response = new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
  return withCors(response, origin)
}

const slug = (s: string) =>
  String(s || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'job'
