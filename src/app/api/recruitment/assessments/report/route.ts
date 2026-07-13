// GET /api/recruitment/assessments/report
// Downloadable interview performance report — aggregated scores across all
// completed rounds, grouped by designation / job title.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const format = (searchParams.get('format') || 'excel').toLowerCase()

    const assessments = await (prisma as any).recruitmentCandidateAssessment.findMany({
      where: { companyId, roundStatus: 'COMPLETED' },
      include: {
        application: {
          select: {
            job: { select: { title: true, department: true } },
            candidate: { select: { firstName: true, lastName: true } },
          },
        },
        plan: { select: { name: true, rounds: { select: { order: true, title: true } } } },
        scorecards: {
          select: {
            scores: true,
            recommendation: true,
            notes: true,
            interviewerId: true,
            submittedAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Group by job title
    const grouped = new Map<string, any[]>()
    for (const a of assessments) {
      const jobTitle = a.application?.job?.title || 'Unknown'
      if (!grouped.has(jobTitle)) grouped.set(jobTitle, [])
      grouped.get(jobTitle)!.push(a)
    }

    if (format === 'json') {
      const data = Array.from(grouped.entries()).map(([jobTitle, items]) => ({
        designation: jobTitle,
        totalCandidates: items.length,
        candidates: items.map((a: any) => {
          const scorecards = a.scorecards || []
          const recommendations = scorecards.map((s: any) => s.recommendation)
          const hire = recommendations.filter((r: string) => r === 'HIRE').length
          const noHire = recommendations.filter((r: string) => r === 'NO_HIRE').length
          return {
            name: `${a.application?.candidate?.firstName || ''} ${a.application?.candidate?.lastName || ''}`.trim(),
            averageScore: a.averageScore ?? null,
            finalRecommendation: hire > noHire ? 'HIRE' : noHire > hire ? 'NO_HIRE' : 'MAYBE',
            scorecards: scorecards.map((s: any) => ({
              scores: s.scores,
              recommendation: s.recommendation,
              notes: s.notes,
            })),
          }
        }),
      }))
      return withCors(ApiResponse.success(data), origin)
    }

    // Excel download
    const workbook = new ExcelJS.Workbook()
    workbook.creator = '247HR'

    // Fetch company info for the report header
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { companyName: true, tradingName: true, address: true, email: true },
    })
    const companyName = company?.tradingName || company?.companyName || 'Your Company'
    const now = new Date()

    for (const [jobTitle, items] of grouped.entries()) {
      const sheet = workbook.addWorksheet(jobTitle.substring(0, 31))
      const lastCol = 6

      // Row 1 — Company name
      sheet.mergeCells(`A1:${String.fromCharCode(64 + lastCol)}1`)
      const titleCell = sheet.getCell('A1')
      titleCell.value = companyName.toUpperCase()
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      sheet.getRow(1).height = 30

      // Row 2 — Report title
      sheet.mergeCells(`A2:${String.fromCharCode(64 + lastCol)}2`)
      const reportCell = sheet.getCell('A2')
      reportCell.value = `Interview Performance Report — ${jobTitle}`
      reportCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
      reportCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      reportCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      sheet.getRow(2).height = 22

      // Row 3 — Date & company info
      sheet.mergeCells(`A3:${String.fromCharCode(64 + lastCol)}3`)
      const infoCell = sheet.getCell('A3')
      infoCell.value = `Generated: ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${company?.address || ''} · ${company?.email || ''}`
      infoCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }
      sheet.getRow(3).height = 16

      // Row 4 — spacer
      sheet.getRow(4).height = 8

      // Row 5 — Column headers
      const headerRow = sheet.getRow(5)
      const headers = ['Candidate', 'Average Score', 'Recommendation', 'Round', 'Panelist Scores', 'Notes']
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1)
        cell.value = h
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      })
      headerRow.height = 20

      // Column widths
      sheet.getColumn(1).width = 30
      sheet.getColumn(2).width = 15
      sheet.getColumn(3).width = 15
      sheet.getColumn(4).width = 20
      sheet.getColumn(5).width = 45
      sheet.getColumn(6).width = 30

      let rowNum = 6
      for (const a of items) {
        const candidateName = `${a.application?.candidate?.firstName || ''} ${a.application?.candidate?.lastName || ''}`.trim()
        const scorecards = a.scorecards || []
        const recommendations = scorecards.map((s: any) => s.recommendation)
        const hireCount = recommendations.filter((r: string) => r === 'HIRE').length
        const noHireCount = recommendations.filter((r: string) => r === 'NO_HIRE').length
        const final = hireCount > noHireCount ? 'HIRE' : noHireCount > hireCount ? 'NO_HIRE' : 'MAYBE'

        const round = a.plan?.rounds?.find((r: any) => r.order === a.currentRoundOrder)
        const roundLabel = round ? `Round ${round.order}: ${round.title}` : '—'

        const panelistScores = scorecards
          .map((s: any) => {
            const scores = s.scores && typeof s.scores === 'object'
              ? Object.entries(s.scores as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(', ')
              : '—'
            return `${s.recommendation} [${scores}]`
          })
          .join(' | ')

        const row = sheet.getRow(rowNum)
        row.getCell(1).value = candidateName
        row.getCell(2).value = a.averageScore ?? '—'
        row.getCell(3).value = final
        row.getCell(4).value = roundLabel
        row.getCell(5).value = panelistScores || '—'
        row.getCell(6).value = scorecards.map((s: any) => s.notes || '').filter(Boolean).join('; ') || '—'
        rowNum++
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="interview_performance_report.xlsx"',
        'Access-Control-Allow-Origin': origin || '*',
      },
    })
  } catch (error) { return withCors(handleApiError(error), origin) }
}
