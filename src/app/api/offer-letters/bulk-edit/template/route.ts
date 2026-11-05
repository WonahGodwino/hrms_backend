// src/app/api/offer-letters/bulk-edit/template/route.ts
//
// POST — builds a downloadable Excel sheet, one row per selected offer
// letter, prefilled with its current variable values. All selected letters
// must come from the same template (different templates have different
// variable sets, so mixing them would produce a sparse, confusing sheet).
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

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await request.json()
    const { companyId, ids }: { companyId?: string; ids?: string[] } = body

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return withCors(ApiResponse.error('Please select at least one offer letter', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const letters = await prisma.generatedOfferLetter.findMany({
      where: { id: { in: ids }, companyId },
      include: { template: true },
    })

    if (letters.length === 0) {
      return withCors(ApiResponse.error('No matching offer letters found', 404), origin)
    }

    const templateIds = new Set(letters.map((l) => l.templateId))
    if (templateIds.size > 1) {
      return withCors(
        ApiResponse.error('All selected offer letters must be from the same template to bulk edit them together.', 400),
        origin
      )
    }

    const template = letters[0].template
    const variables: string[] = (template?.variables as string[]) || []

    // "letterId" is a system identifier, not a template variable, so it's
    // deliberately left un-humanized — it must always be matched literally
    // on upload to identify which letter a row belongs to.
    const labels = buildOfferLetterFieldLabels([...BASE_FIELD_KEYS, ...variables])
    const columns = [
      { header: 'letterId', key: 'letterId', width: 26, align: 'left' as const },
      { header: labels.get('recipientName') as string, key: 'recipientName', width: 24, align: 'left' as const },
      { header: labels.get('recipientEmail') as string, key: 'recipientEmail', width: 28, align: 'left' as const },
      { header: labels.get('month') as string, key: 'month', width: 12, align: 'left' as const },
      { header: labels.get('year') as string, key: 'year', width: 10, align: 'left' as const },
      ...variables.map((v) => ({ header: labels.get(v) as string, key: v, width: 24, align: 'left' as const })),
    ]

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } })

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Offer Letters')

    // The header sits on row 4 under the title band; bulk-edit/upload finds it by the letterId column.
    writeStyledTable(worksheet, {
      title: `${template?.name || 'Offer Letters'}, Bulk Edit`,
      subtitle: buildSubtitle([company?.companyName, `${letters.length} letter${letters.length === 1 ? '' : 's'}`, 'Do not change the letterId column']),
      columns,
      rows: letters.map((letter) => {
        const values = (letter.variableValues as Record<string, string>) || {}
        const row: Record<string, any> = {
          letterId: letter.id,
          recipientName: letter.recipientName,
          recipientEmail: letter.recipientEmail,
          month: letter.month,
          year: letter.year,
        }
        variables.forEach((v) => {
          row[v] = values[v] || ''
        })
        return row
      }),
      autoFilter: false,
      footer: confidentialFooter(company?.companyName),
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': XLSX_MIME,
          'Content-Disposition': attachmentDisposition(`Offer Letters Bulk Edit (${safeFileName(company?.companyName || 'Company')}).xlsx`),
          'Cache-Control': 'no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
