import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '../../_helpers'
// @ts-ignore
import ExcelJS from 'exceljs'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null

    if (!file) return withCors(ApiResponse.error('No file uploaded', 400), origin)
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    // Verify company access
    const scopedCompanyIds = await resolveScopedCompanyIds(user)
    if (!scopedCompanyIds.includes(companyId)) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    // Read the file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const results = {
      loansCreated: 0,
      loansFailed: 0,
      benefitsCreated: 0,
      benefitsFailed: 0,
      loanErrors: [] as string[],
      benefitErrors: [] as string[],
    }

    // --- Process Loan Types Sheet ---
    const loanSheet = workbook.getWorksheet('Loan Types')
    if (loanSheet) {
      const rows = loanSheet.getRows(2, loanSheet.rowCount - 1) || []
      for (const row of rows) {
        const name = String(row.getCell(1).value || '').trim()
        if (!name) continue // skip empty rows

        try {
          const interestRatePercent = parseFloat(String(row.getCell(2).value || 5)) || 5
          const maxDurationMonths = parseInt(String(row.getCell(3).value || 12)) || 12
          const maxAmount = parseFloat(String(row.getCell(4).value || 500000)) || 500000
          const minServiceMonths = parseInt(String(row.getCell(5).value || 3)) || 3
          const maxDebtRatioPercent = parseFloat(String(row.getCell(6).value || 40)) || 40
          const requiresGuarantor = String(row.getCell(7).value || '').toLowerCase() === 'true'
          const guarantorThresholdAmount = parseFloat(String(row.getCell(8).value || 0)) || null
          const salaryMultiplier = parseFloat(String(row.getCell(9).value || 1)) || 1
          const isActive = String(row.getCell(10).value || 'true').toLowerCase() !== 'false'
          const rules = String(row.getCell(11).value || '').trim() || null

          // Upsert: update if exists by companyId+name, otherwise create
          await prisma.loanPolicy.upsert({
            where: { companyId_name: { companyId, name } },
            update: {
              interestRatePercent,
              maxDurationMonths,
              maxAmount,
              minServiceMonths,
              maxDebtRatioPercent,
              requiresGuarantor,
              guarantorThresholdAmount: guarantorThresholdAmount || null,
              salaryMultiplier,
              isActive,
              rules,
            },
            create: {
              companyId,
              name,
              interestRatePercent,
              maxDurationMonths,
              maxAmount,
              minServiceMonths,
              maxDebtRatioPercent,
              requiresGuarantor,
              guarantorThresholdAmount: guarantorThresholdAmount || null,
              salaryMultiplier,
              isActive,
              rules,
            },
          })
          results.loansCreated++
        } catch (err: any) {
          results.loansFailed++
          results.loanErrors.push(`Row for "${name}": ${err.message}`)
        }
      }
    }

    // --- Process Benefit Types Sheet ---
    const benefitSheet = workbook.getWorksheet('Benefit Types')
    if (benefitSheet) {
      const rows = benefitSheet.getRows(2, benefitSheet.rowCount - 1) || []
      for (const row of rows) {
        const name = String(row.getCell(1).value || '').trim()
        if (!name) continue

        try {
          const category = String(row.getCell(2).value || 'Health').trim()
          const description = String(row.getCell(3).value || '').trim() || null
          const monetaryValue = parseFloat(String(row.getCell(4).value || 0)) || null
          const keyValue = String(row.getCell(5).value || '').trim() || null
          const eligibilityRule = String(row.getCell(6).value || '').trim() || null
          const isActive = String(row.getCell(7).value || 'true').toLowerCase() !== 'false'

          await prisma.benefitPolicy.upsert({
            where: { companyId_name: { companyId, name } },
            update: {
              category,
              description,
              monetaryValue,
              keyValue,
              eligibilityRule,
              isActive,
            },
            create: {
              companyId,
              name,
              category,
              description,
              monetaryValue,
              keyValue,
              eligibilityRule,
              isActive,
            },
          })
          results.benefitsCreated++
        } catch (err: any) {
          results.benefitsFailed++
          results.benefitErrors.push(`Row for "${name}": ${err.message}`)
        }
      }
    }

    return withCors(
      ApiResponse.success(
        results,
        `Template processed: ${results.loansCreated} loan types, ${results.benefitsCreated} benefit types created/updated`
      ),
      origin
    )
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}