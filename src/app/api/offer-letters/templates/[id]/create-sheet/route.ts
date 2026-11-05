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
import { writeStyledTable, buildSubtitle, confidentialFooter, toneCell, attachmentDisposition, safeFileName, addInstructionsSheet, findHeaderRow, XLSX_MIME } from '@/app/lib/excel/sheet-theme'
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
    const columns = allKeys.map((k) => ({ header: labels.get(k) as string, key: k, width: 24, align: 'left' as const }))

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } })

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Offer Letters')

    // The header sits on row 4 under the title band and the sheet is left blank for data, so the
    // bulk-create upload finds the header by its column labels. Notes live on their own sheet so
    // they never sit in the rows people type into.
    writeStyledTable(worksheet, {
      title: `${template.name}, Offer Letters Sheet`,
      subtitle: buildSubtitle([company?.companyName, 'One row per letter, starting on row 5']),
      columns,
      rows: [],
      autoFilter: false,
    })

    addInstructionsSheet(workbook, {
      title: 'Offer Letters Sheet Instructions',
      subtitle: buildSubtitle([company?.companyName, template.name]),
      sections: [
        {
          heading: 'How to fill this sheet',
          lines: [
            'One row creates one offer letter.',
            'Start on row 5, directly under the column headings. Do not rename or reorder the columns.',
            'Every column is used to fill the matching placeholder in the offer letter template.',
            'Upload the completed sheet from the Offer Letters bulk create screen.',
          ],
        },
      ],
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': XLSX_MIME,
          'Content-Disposition': attachmentDisposition(`Offer Letters Sheet (${safeFileName(template.name)}).xlsx`),
          'Cache-Control': 'no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
