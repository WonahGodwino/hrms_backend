// src/app/api/offer-letters/templates/[id]/create-sheet/route.ts
//
// GET — a blank Excel sheet for bulk-generating new offer letters from this
// template: recipientName, recipientEmail, month, year, plus one column per
// {{variable}} the template uses. One row = one letter. No prefilled data —
// this module never references staff records, so the sheet is the only
// source of truth for who each letter is for.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import ExcelJS from 'exceljs'
import { buildOfferLetterFieldLabels, BASE_FIELD_KEYS } from '@/app/lib/offer-letters/variableLabels'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const companyId = request.nextUrl.searchParams.get('companyId')
    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const template = await prisma.offerLetterTemplate.findFirst({ where: { id, companyId } })
    if (!template) {
      return withCors(ApiResponse.error('Template not found for this company', 404), origin)
    }

    const variables: string[] = (template.variables as string[]) || []
    const allKeys = [...BASE_FIELD_KEYS, ...variables]
    const labels = buildOfferLetterFieldLabels(allKeys)
    const columns = allKeys.map((k) => ({ header: labels.get(k) as string, key: k, width: 24 }))

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Offer Letters')

    // Assigning .columns writes the header values straight into row 1 —
    // nothing should be added to the sheet before this line.
    worksheet.columns = columns

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    const buffer = await workbook.xlsx.writeBuffer()
    const safeTemplateName = template.name.replace(/[^a-zA-Z0-9]+/g, '_')

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${safeTemplateName}-offer-letters-sheet.xlsx"`,
          'Cache-Control': 'no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
