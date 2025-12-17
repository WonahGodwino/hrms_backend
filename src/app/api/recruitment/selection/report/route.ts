// src/app/api/recruitment/selection/report/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractKeywords, calculateMatchScore } from '@/app/lib/keywordExtractor'
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

    // Get job with applications and their CV files
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        companyId: user.companyId as string,
      },
      include: {
        applications: {
          include: {
            candidate: true,
            cvFile: {
              select: {
                parsedCvContent: true
              }
            },
            stageHistory: {
              orderBy: {
                changedAt: 'desc'
              },
              take: 1
            }
          }
        },
        keywords: true
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

    if (!job.applications.length) {
      return withCors(
        ApiResponse.error('No applications found for this job', 404),
        origin
      )
    }

    // Extract job keywords from description and saved keywords
    const jobDescriptionKeywords = extractKeywords(job.description || '')
    const savedKeywords = job.keywords.map(k => k.name.toLowerCase())
    const allJobKeywords = [...new Set([...jobDescriptionKeywords, ...savedKeywords])]

    // Process and rank applicants
    const processedApplications = await Promise.all(
      job.applications.map(async (applicant) => {
        const cvText = applicant.parsedCvContent || ''
        const matchScore = calculateMatchScore(allJobKeywords, cvText)
        
        // Determine if already reviewed
        const lastStage = applicant.stageHistory[0]
        const isReviewed = lastStage?.toStatus === 'REVIEWING' || lastStage?.toStatus === 'REVIEWED'
        
        return {
          ...applicant,
          matchCount: matchScore.matchCount,
          matchPercentage: matchScore.percentage,
          matchedKeywords: matchScore.matchedKeywords,
          isReviewed
        }
      })
    )

    // Sort by match score
    const sorted = processedApplications.sort((a, b) => b.matchCount - a.matchCount)

    // Shape data for export
    const exportRows = sorted.map((applicant, index) => ({
      rank: index + 1,
      applicationId: applicant.id,
      firstName: applicant.candidate.firstName,
      lastName: applicant.candidate.lastName,
      email: applicant.candidate.email,
      currentStatus: applicant.status,
      matchCount: applicant.matchCount,
      matchPercentage: applicant.matchPercentage,
      isReviewed: applicant.isReviewed ? 'Yes' : 'No',
      appliedAt: applicant.createdAt,
      lastReviewDate: applicant.stageHistory[0]?.changedAt || null,
      jobId: job.id,
      jobTitle: job.title,
      department: job.department,
      position: job.position,
    }))

    if (format === 'excel' || format === 'xlsx') {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Ranked Applicants')
      
      // Style header
      sheet.getRow(1).font = { bold: true }
      sheet.columns = [
        { width: 10 }, // Rank
        { width: 36 }, // Application ID
        { width: 15 }, // First Name
        { width: 15 }, // Last Name
        { width: 25 }, // Email
        { width: 15 }, // Status
        { width: 12 }, // Match Count
        { width: 15 }, // Match %
        { width: 12 }, // Reviewed?
        { width: 20 }, // Applied At
        { width: 20 }, // Last Review
        { width: 36 }, // Job ID
        { width: 25 }, // Job Title
        { width: 20 }, // Department
        { width: 20 }, // Position
      ]

      sheet.addRow([
        'Rank',
        'Application ID',
        'First Name',
        'Last Name',
        'Email',
        'Status',
        'Match Score',
        'Match %',
        'Reviewed?',
        'Applied At',
        'Last Review Date',
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
          row.currentStatus,
          row.matchCount,
          `${row.matchPercentage.toFixed(1)}%`,
          row.isReviewed,
          row.appliedAt.toISOString().split('T')[0],
          row.lastReviewDate ? new Date(row.lastReviewDate).toISOString().split('T')[0] : 'Not Reviewed',
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
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="job_${job.id}_ranked_applicants_${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
      })

      return withCors(response, origin)
    }

    // CSV format
    const header = [
      'Rank',
      'Application ID',
      'First Name',
      'Last Name',
      'Email',
      'Status',
      'Match Score',
      'Match %',
      'Reviewed?',
      'Applied At',
      'Last Review Date',
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
        row.currentStatus,
        row.matchCount,
        `${row.matchPercentage.toFixed(1)}%`,
        row.isReviewed,
        row.appliedAt.toISOString().split('T')[0],
        row.lastReviewDate ? new Date(row.lastReviewDate).toISOString().split('T')[0] : 'Not Reviewed',
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
        'Content-Disposition': `attachment; filename="job_${job.id}_ranked_applicants_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })

    return withCors(response, origin)
  } catch (error: unknown) {
    const message = formatError(error)
    console.error('Error generating selection report:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}