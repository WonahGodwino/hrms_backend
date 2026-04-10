// src/app/api/payroll/templates/dynamic/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'

function normalizeSection(section: string): string {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_')
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
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

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
      FIXED_VALUE: template.fields.filter(f => normalizeSection(f.section) === 'FIXED_VALUE'),
      EARNINGS: template.fields.filter(f => normalizeSection(f.section) === 'EARNINGS'),
      DEDUCTIONS: template.fields.filter(f => normalizeSection(f.section) === 'DEDUCTIONS')
    }

    const getSampleValue = (dataType: string): string => {
      if (dataType === 'Number') return '0.00'
      if (dataType === 'Date') return new Date().toISOString().split('T')[0]
      if (dataType === 'Percentage') return '0%'
      return 'Sample'
    }

    // Build worksheet data
    const worksheetData: any[][] = []

    // Title
    worksheetData.push([`${template.templateName} - PAYROLL TEMPLATE`])
    worksheetData.push([`Company: ${companyName}`])
    worksheetData.push([`Created: ${new Date(template.createdAt).toLocaleDateString()}`])
    worksheetData.push([])

    // Single unified headers row across all sections
    const baseStaffHeaders = [
      'Employee ID',
      'Department',
      'Name',
      'Email'
    ]
    const baseHeaderLookup = new Set(baseStaffHeaders.map((header) => header.toLowerCase()))

    const staffCustomFields = sections.STAFF_DETAILS.filter(
      (field) => !baseHeaderLookup.has(field.displayName.toLowerCase())
    )

    const staffCustomHeaders = staffCustomFields.map((field) =>
      field.required ? `${field.displayName}*` : field.displayName
    )
    const fixedHeaders = sections.FIXED_EARNINGS.map((field) =>
      field.required
        ? `${field.displayName}* [Fixed Earnings]`
        : `${field.displayName} [Fixed Earnings]`
    )
    const fixedValueHeaders = sections.FIXED_VALUE.map((field) =>
      field.required
        ? `${field.displayName}* [Fixed Value]`
        : `${field.displayName} [Fixed Value]`
    )
    const earningsHeaders = sections.EARNINGS.map((field) =>
      field.required
        ? `${field.displayName}* [Variable Earnings]`
        : `${field.displayName} [Variable Earnings]`
    )
    const deductionHeaders = sections.DEDUCTIONS.map((field) =>
      field.required
        ? `${field.displayName}* [Deductions]`
        : `${field.displayName} [Deductions]`
    )

    const unifiedColumns = [
      ...baseStaffHeaders.map((label) => ({ label, section: 'STAFF_DETAILS' as const })),
      ...staffCustomHeaders.map((label) => ({ label, section: 'STAFF_DETAILS' as const })),
      ...fixedHeaders.map((label) => ({ label, section: 'FIXED_EARNINGS' as const })),
      ...fixedValueHeaders.map((label) => ({ label, section: 'FIXED_VALUE' as const })),
      ...earningsHeaders.map((label) => ({ label, section: 'EARNINGS' as const })),
      ...deductionHeaders.map((label) => ({ label, section: 'DEDUCTIONS' as const }))
    ]
    const unifiedHeaders = unifiedColumns.map((column) => column.label)
    worksheetData.push(unifiedHeaders)

    // Single sample row aligned with unified headers
    const unifiedSampleRow = [
      'EMP001',
      'IT',
      'John Doe',
      'john@example.com',
      ...staffCustomFields.map((field) => getSampleValue(field.dataType)),
      ...sections.FIXED_EARNINGS.map((field) => getSampleValue(field.dataType)),
      ...sections.FIXED_VALUE.map((field) => getSampleValue(field.dataType)),
      ...sections.EARNINGS.map((field) => getSampleValue(field.dataType)),
      ...sections.DEDUCTIONS.map((field) => getSampleValue(field.dataType))
    ]
    worksheetData.push(unifiedSampleRow)
    worksheetData.push([])

    const referenceData: any[][] = []

    // INSTRUCTIONS
    referenceData.push(['=== INSTRUCTIONS ==='])
    referenceData.push(['1. Do not modify the header row order'])
    referenceData.push(['2. Fields marked with * are required'])
    referenceData.push(['3. Employee ID must match existing employees in the system'])
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
    const worksheet = workbook.addWorksheet('Payroll Template')

    worksheetData.forEach((row) => {
      worksheet.addRow(row)
    })

    worksheet.columns = Array.from({ length: totalCols }, () => ({ width: 20 }))

    // Color-code consolidated header columns by section for easier visual grouping.
    const headerRowIndex = 5
    const headerRow = worksheet.getRow(headerRowIndex)
    const sectionStyles: Record<string, { fill: string; font: string }> = {
      STAFF_DETAILS: { fill: 'FFDCEBFF', font: 'FF1E3A8A' },
      FIXED_EARNINGS: { fill: 'FFE6F7EC', font: 'FF14532D' },
      FIXED_VALUE: { fill: 'FFE3F2FD', font: 'FF0C4A6E' },
      EARNINGS: { fill: 'FFFFF3D6', font: 'FF92400E' },
      DEDUCTIONS: { fill: 'FFFDE2E2', font: 'FF991B1B' }
    }

    unifiedColumns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1)
      const style = sectionStyles[column.section]
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: style.fill }
      }
      cell.font = {
        bold: true,
        color: { argb: style.font }
      }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBDBDBD' } },
        left: { style: 'thin', color: { argb: 'FFBDBDBD' } },
        bottom: { style: 'thin', color: { argb: 'FFBDBDBD' } },
        right: { style: 'thin', color: { argb: 'FFBDBDBD' } }
      }
    })

    // Generate filename
    const sanitizedCompanyName = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const sanitizedTemplateName = template.templateName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${sanitizedCompanyName}_${sanitizedTemplateName}_template_${timestamp}`

    if (format === 'csv') {
      // Convert to CSV
      const csv = toCsv([...worksheetData, [], ...referenceData])
      const csvBuffer = Buffer.from(csv, 'utf-8')
      
      const response = new NextResponse(csvBuffer, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
          'X-Template-Id': templateId,
          'X-Template-Name': encodeURIComponent(template.templateName)
        }
      })
      return withCors(response, origin)
    } else {
      const referenceWorksheet = workbook.addWorksheet('Instructions & Fields')
      referenceData.forEach((row) => {
        referenceWorksheet.addRow(row)
      })
      referenceWorksheet.columns = Array.from({ length: 5 }, () => ({ width: 28 }))

      // Generate Excel file
      const arrayBuffer = await workbook.xlsx.writeBuffer()
      const uint8Array = new Uint8Array(arrayBuffer as ArrayBuffer)
      
      const response = new NextResponse(uint8Array, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
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