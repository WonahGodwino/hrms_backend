// src/app/api/recruitment/selection/report/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractKeywords } from '@/app/lib/keywordExtractor'
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for this user', 400),
        origin
      )
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const format = (searchParams.get('format') || 'csv').toLowerCase()

    if (!jobId) {
      return withCors(
        ApiResponse.error('jobId query parameter is required', 400),
        origin
      )
    }

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        companyId: user.companyId as string,
      },
      include: {
        applications: true,
      },
    })

    if (!job) {
      return withCors(
        ApiResponse.error(
          'Job not found for this company or you do not have access',
          404
        ),
        origin
      )
    }

    const applicants = job.applications

    if (!applicants.length) {
      return withCors(
        ApiResponse.error('No applications found for this job', 404),
        origin
      )
    }

    const jobKeywords = extractKeywords(job.description || '')

    const ranked = applicants.map((applicant) => {
      const cvText =
        (applicant as any).parsedCvContent?.toLowerCase?.() || ''
      let matchCount = 0

      jobKeywords.forEach((keyword) => {
        if (!keyword) return
        const k = keyword.toLowerCase()
        if (cvText.includes(k)) {
          matchCount++
        }
      })

      return { ...applicant, matchCount }
    })

    const sorted = ranked.sort((a, b) => b.matchCount - a.matchCount)

    // Shape data for export
    const exportRows = sorted.map((applicant, index) => ({
      rank: index + 1,
      applicationId: applicant.id,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      email: applicant.email,
      status: applicant.status,
      matchCount: (applicant as any).matchCount ?? 0,
      appliedAt: applicant.createdAt,
      jobId: job.id,
      jobTitle: job.title,
      department: job.department,
      position: job.position,
    }))

    if (format === 'excel' || format === 'xlsx') {
      // ✅ Generate Excel report
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Applicants')

      sheet.addRow([
        'Rank',
        'Application ID',
        'First Name',
        'Last Name',
        'Email',
        'Status',
        'Match Score',
        'Applied At',
        'Job ID',
        'Job Title',
        'Department',
        'Position',
      ])

      exportRows.forEach((row) => {
        sheet.addRow([
          row.rank,
          row.applicationId,
          row.firstName,
          row.lastName,
          row.email,
          row.status,
          row.matchCount,
          row.appliedAt,
          row.jobId,
          row.jobTitle,
          row.department,
          row.position,
        ])
      })

      const buffer = await workbook.xlsx.writeBuffer()

      const response = new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="job_${job.id}_ranked_applicants.xlsx"`,
        },
      })

      return withCors(response, origin)
    }

    // ✅ Generate CSV report by default
    const header = [
      'Rank',
      'Application ID',
      'First Name',
      'Last Name',
      'Email',
      'Status',
      'Match Score',
      'Applied At',
      'Job ID',
      'Job Title',
      'Department',
      'Position',
    ]

    const escapeCsv = (value: unknown) => {
      if (value == null) return ''
      const str = String(value)
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = exportRows.map((row) =>
      [
        row.rank,
        row.applicationId,
        row.firstName,
        row.lastName,
        row.email,
        row.status,
        row.matchCount,
        row.appliedAt.toISOString(),
        row.jobId,
        row.jobTitle,
        row.department,
        row.position,
      ]
        .map(escapeCsv)
        .join(',')
    )

    const csvContent = [header.join(','), ...rows].join('\n')

    const response = new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="job_${job.id}_ranked_applicants.csv"`,
      },
    })

    return withCors(response, origin)
  } catch (error: unknown) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
