// src/app/api/payroll/templates/dynamic/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { XL, XLSX_MIME, attachmentDisposition, buildSubtitle, confidentialFooter, safeFileName, solid, writeStyledTable } from '@/app/lib/excel/sheet-theme'

function normalizeSection(section: string): string {
  const normalized = (section || '').toUpperCase().replace(/[\s-]+/g, '_')
  // Canonical plural key (matches template storage + frontend); accept the
  // legacy singular spelling.
  if (normalized === 'FIXED_VALUE') return 'FIXED_VALUES'
  return normalized
}

function toCsv(data: any[][]): string {
  return data
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell)
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        })
        .join(',')
    )
    .join('\n')
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')
    const companyId = searchParams.get('companyId')
    const format = searchParams.get('format') || 'excel' // excel or csv

    if (!templateId) {
      return withCors(ApiResponse.error('Template ID is required', 400), origin)
    }

    // Get template with fields
    const template = await prisma.payrollTemplate.findUnique({
      where: { id: templateId },
      include: {
        fields: {
          orderBy: { order: 'asc' }
        }
      }
    })

    if (!template) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    // Check access
    if (!template.isSystem && user.role !== 'SUPER_ADMIN') {
      // For non-system templates, verify company access
      const templateCompanyId = template.companyId
      
      if (companyId && templateCompanyId !== companyId) {
        return withCors(ApiResponse.error('Template does not belong to selected company', 403), origin)
      }

      if (!companyId) {
        return withCors(ApiResponse.error('Company selection is required', 400), origin)
      }

      const hasAccess = await verifyCompanyAccess(user, templateCompanyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this template', 403), origin)
      }
    }

    // Get company details for filename
    let companyName = 'System'
    if (!template.isSystem && companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { companyName: true }
      })
      if (company) {
        companyName = company.companyName
      }
    }

    // Group fields by section
    const sections = {
      STAFF_DETAILS: template.fields.filter(f => normalizeSection(f.section) === 'STAFF_DETAILS'),
      FIXED_EARNINGS: template.fields.filter(f => normalizeSection(f.section) === 'FIXED_EARNINGS'),
      FIXED_VALUES: template.fields.filter(f => normalizeSection(f.section) === 'FIXED_VALUES'),
      EARNINGS: template.fields.filter(f => normalizeSection(f.section) === 'EARNINGS'),
      DEDUCTIONS: template.fields.filter(f => normalizeSection(f.section) === 'DEDUCTIONS')
    }

    const getSampleValue = (dataType: string): string => {
      if (dataType === 'Number') return '0.00'
      if (dataType === 'Date') return new Date().toISOString().split('T')[0]
      if (dataType === 'Percentage') return '0%'
      return 'Sample'
    }

    // A handful of common STAFF_DETAILS fields get a friendlier, recognizable
    // sample instead of the generic "Sample" text — purely cosmetic, doesn't
    // affect which fields/columns actually appear (that's driven entirely by
    // the template's real fields below).
    const getStaffSampleValue = (field: { systemField?: string | null; displayName: string; dataType: string }): string => {
      if (field.dataType !== 'Text') return getSampleValue(field.dataType)
      const key = `${field.systemField || ''} ${field.displayName || ''}`.toLowerCase()
      if (key.includes('staffid') || key.includes('staff id') || key.includes('employeeid') || key.includes('employee id')) return 'EMP001'
      if (key.includes('email')) return 'john@example.com'
      if (key.includes('name')) return 'John Doe'
      if (key.includes('department') || key.includes('costcenter') || key.includes('cost center')) return 'IT'
      if (key.includes('month')) return new Date().toLocaleString('en-US', { month: 'long' })
      return getSampleValue(field.dataType)
    }

    // Build worksheet data
    const worksheetData: any[][] = []

    // Title
    worksheetData.push([`${template.templateName} - PAYROLL TEMPLATE`])
    worksheetData.push([`Company: ${companyName}`])
    worksheetData.push([`Created: ${new Date(template.createdAt).toLocaleDateString()}`])
    worksheetData.push([])

    // Single unified headers row across all sections. STAFF_DETAILS columns
    // are derived entirely from the template's real fields — no hardcoded
    // column list — so a field only ever appears here if it was actually
    // added to the template (and every field that was added does appear).
    const staffHeaders = sections.STAFF_DETAILS.map((field) => field.displayName)
    const fixedHeaders = sections.FIXED_EARNINGS.map((field) => field.displayName)
    const fixedValueHeaders = sections.FIXED_VALUES.map((field) => field.displayName)
    const earningsHeaders = sections.EARNINGS.map((field) => field.displayName)
    const deductionHeaders = sections.DEDUCTIONS.map((field) => field.displayName)

    const unifiedColumns = [
      ...staffHeaders.map((label) => ({ label, section: 'STAFF_DETAILS' as const })),
      ...fixedHeaders.map((label) => ({ label, section: 'FIXED_EARNINGS' as const })),
      ...fixedValueHeaders.map((label) => ({ label, section: 'FIXED_VALUES' as const })),
      ...earningsHeaders.map((label) => ({ label, section: 'EARNINGS' as const })),
      ...deductionHeaders.map((label) => ({ label, section: 'DEDUCTIONS' as const }))
    ]
    const unifiedHeaders = unifiedColumns.map((column) => column.label)
    worksheetData.push(unifiedHeaders)

    // Single sample row aligned with unified headers
    const unifiedSampleRow = [
      ...sections.STAFF_DETAILS.map((field) => getStaffSampleValue(field)),
      ...sections.FIXED_EARNINGS.map((field) => getSampleValue(field.dataType)),
      ...sections.FIXED_VALUES.map((field) => getSampleValue(field.dataType)),
      ...sections.EARNINGS.map((field) => getSampleValue(field.dataType)),
      ...sections.DEDUCTIONS.map((field) => getSampleValue(field.dataType))
    ]
    worksheetData.push(unifiedSampleRow)
    worksheetData.push([])

    const referenceData: any[][] = []

    // INSTRUCTIONS
    referenceData.push(['=== INSTRUCTIONS ==='])
    referenceData.push(['1. Do not modify the header row order'])
    referenceData.push(['2. Fill every column your template defines'])
    referenceData.push(['3. Staff ID (or your template\'s staff identifier field) must match an existing employee in the system'])
    referenceData.push(['4. Add one row per employee when entering actual payroll data'])
    referenceData.push(['5. Leave values blank only when the field is not applicable'])
    referenceData.push(['6. Upload the file through the payroll upload endpoint'])
    referenceData.push([])

    // FIELD LIST
    referenceData.push(['=== TEMPLATE FIELDS ==='])
    referenceData.push(['Section', 'Field Name', 'Data Type', 'Required', 'Show on Payslip'])
    
    template.fields.forEach(field => {
      referenceData.push([
        field.section.replace('_', ' '),
        field.displayName,
        field.dataType,
        field.required ? 'Yes' : 'No',
        field.showOnPayslip ? 'Yes' : 'No'
      ])
    })

    // Set column widths
    const totalCols = Math.max(
      unifiedHeaders.length,
      5
    )

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Payroll Template')

    // Section colour coding for the header cells: the colour tells HR which kind of
    // column they are filling in. The header sits on row 4 under the centred title band;
    // the payroll processors find it by matching template field names, so the banner,
    // notes and legend never reach the data.
    const sectionTones: Record<string, string> = {
      STAFF_DETAILS: XL.BRAND_DEEP,
      FIXED_EARNINGS: XL.SUCCESS_FG,
      FIXED_VALUES: XL.INFO_FG,
      EARNINGS: XL.WARN_FG,
      DEDUCTIONS: XL.DANGER_FG
    }

    const table = writeStyledTable(worksheet, {
      title: `${template.templateName}, Payroll Template`,
      subtitle: buildSubtitle([
        companyName,
        `Created ${new Date(template.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
      ]),
      columns: unifiedColumns.map((column, i) => ({
        header: column.label,
        key: `c${i}`,
        width: column.section === 'STAFF_DETAILS' ? 22 : 20,
        align: 'center' as const
      })),
      rows: [Object.fromEntries(unifiedSampleRow.map((v, i) => [`c${i}`, v]))],
      autoFilter: false
    })

    unifiedColumns.forEach((column, index) => {
      const cell = worksheet.getRow(table.headerRow).getCell(index + 1)
      cell.fill = solid(sectionTones[column.section])
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })
    worksheet.getRow(table.headerRow).height = 34

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0]
    const excelFileName = `Payroll Template (${safeFileName(companyName)}) ${safeFileName(template.templateName)} ${timestamp}.xlsx`

    if (format === 'csv') {
      // Convert to CSV
      const csv = toCsv([...worksheetData, [], ...referenceData])
      const csvBuffer = Buffer.from(csv, 'utf-8')
      
      const response = new NextResponse(csvBuffer, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': attachmentDisposition(excelFileName.replace(/\.xlsx$/, '.csv')),
          'X-Template-Id': templateId,
          'X-Template-Name': encodeURIComponent(template.templateName)
        }
      })
      return withCors(response, origin)
    } else {
      const fieldsSheet = workbook.addWorksheet('Instructions & Fields')
      writeStyledTable(fieldsSheet, {
        title: 'Instructions and Template Fields',
        subtitle: buildSubtitle([companyName, template.templateName]),
        columns: [
          { header: 'Section', key: 'section', width: 24, align: 'left' },
          { header: 'Field Name', key: 'name', width: 34, align: 'left' },
          { header: 'Data Type', key: 'type', width: 18, align: 'left' },
          { header: 'Required', key: 'required', width: 12, align: 'center' },
          { header: 'Show on Payslip', key: 'payslip', width: 18, align: 'center' }
        ],
        rows: template.fields.map((field) => ({
          section: field.section.replace(/_/g, ' '),
          name: field.displayName,
          type: field.dataType,
          required: field.required ? 'Yes' : 'No',
          payslip: field.showOnPayslip ? 'Yes' : 'No'
        })),
        notes: {
          heading: 'Instructions',
          lines: [
            '1. Do not modify the header row order',
            '2. Fill every column your template defines',
            "3. Staff ID (or your template's staff identifier field) must match an existing employee in the system",
            '4. Replace the sample row and add one row per employee when entering actual payroll data',
            '5. Leave values blank only when the field is not applicable',
            '6. Upload the file through the payroll upload endpoint',
            'Header colours on the Payroll Template sheet: purple = staff details, green = fixed earnings, blue = fixed values, amber = variable earnings, red = deductions'
          ]
        },
        footer: confidentialFooter(companyName)
      })

      // Generate Excel file
      const arrayBuffer = await workbook.xlsx.writeBuffer()
      const uint8Array = new Uint8Array(arrayBuffer as ArrayBuffer)
      
      const response = new NextResponse(uint8Array, {
        headers: {
          'Content-Type': XLSX_MIME,
          'Content-Disposition': attachmentDisposition(excelFileName),
          'X-Template-Id': templateId,
          'X-Template-Name': encodeURIComponent(template.templateName)
        }
      })
      return withCors(response, origin)
    }

  } catch (error) {
    console.error('Error downloading template:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

async function verifyCompanyAccess(user: any, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  
  try {
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId: companyId,
        OR: [
          { role: user.role },
          { role: 'ALL' }
        ]
      }
    })
    return !!userCompany
  } catch {
    return user.companyId === companyId
  }
}