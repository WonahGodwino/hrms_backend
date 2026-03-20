// src/app/api/payroll/templates/dynamic/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { groupFieldsBySection } from '@/app/lib/payroll/utils'

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
      STAFF_DETAILS: template.fields.filter(f => f.section === 'STAFF_DETAILS'),
      FIXED_EARNINGS: template.fields.filter(f => f.section === 'FIXED_EARNINGS'),
      EARNINGS: template.fields.filter(f => f.section === 'EARNINGS'),
      DEDUCTIONS: template.fields.filter(f => f.section === 'DEDUCTIONS')
    }

    // Build worksheet data
    const worksheetData: any[][] = []

    // Title
    worksheetData.push([`${template.templateName} - PAYROLL TEMPLATE`])
    worksheetData.push([`Company: ${companyName}`])
    worksheetData.push([`Created: ${new Date(template.createdAt).toLocaleDateString()}`])
    worksheetData.push([])

    // STAFF DETAILS SECTION
    worksheetData.push(['=== STAFF DETAILS ==='])
    worksheetData.push([])

    // Staff Details Headers
    const staffDetailHeaders = [
      'Employee ID',
      'Department',
      'Name',
      'Email',
      ...sections.STAFF_DETAILS.map(f => 
        f.required ? `${f.displayName}*` : f.displayName
      )
    ]
    worksheetData.push(staffDetailHeaders)

    // Sample data for staff details
    const staffDetailSample = [
      'EMP001',
      'IT',
      'John Doe',
      'john@example.com',
      ...sections.STAFF_DETAILS.map(f => {
        if (f.dataType === 'Number') return '0.00'
        if (f.dataType === 'Date') return new Date().toISOString().split('T')[0]
        if (f.dataType === 'Percentage') return '0%'
        return 'Sample'
      })
    ]
    worksheetData.push(staffDetailSample)
    worksheetData.push([])

    // FIXED EARNINGS SECTION
    if (sections.FIXED_EARNINGS.length > 0) {
      worksheetData.push(['=== FIXED EARNINGS ==='])
      worksheetData.push([])

      const fixedEarningsHeaders = [
        'Employee ID',
        ...sections.FIXED_EARNINGS.map(f => 
          f.required ? `${f.displayName}*` : f.displayName
        )
      ]
      worksheetData.push(fixedEarningsHeaders)

      const fixedEarningsSample = [
        'EMP001',
        ...sections.FIXED_EARNINGS.map(() => '0.00')
      ]
      worksheetData.push(fixedEarningsSample)
      worksheetData.push([])
    }

    // VARIABLE EARNINGS SECTION
    if (sections.EARNINGS.length > 0) {
      worksheetData.push(['=== VARIABLE EARNINGS ==='])
      worksheetData.push([])

      const earningsHeaders = [
        'Employee ID',
        ...sections.EARNINGS.map(f => 
          f.required ? `${f.displayName}*` : f.displayName
        )
      ]
      worksheetData.push(earningsHeaders)

      const earningsSample = [
        'EMP001',
        ...sections.EARNINGS.map(() => '0.00')
      ]
      worksheetData.push(earningsSample)
      worksheetData.push([])
    }

    // DEDUCTIONS SECTION
    if (sections.DEDUCTIONS.length > 0) {
      worksheetData.push(['=== DEDUCTIONS ==='])
      worksheetData.push([])

      const deductionsHeaders = [
        'Employee ID',
        ...sections.DEDUCTIONS.map(f => 
          f.required ? `${f.displayName}*` : f.displayName
        )
      ]
      worksheetData.push(deductionsHeaders)

      const deductionsSample = [
        'EMP001',
        ...sections.DEDUCTIONS.map(() => '0.00')
      ]
      worksheetData.push(deductionsSample)
      worksheetData.push([])
    }

    // Multiple staff rows
    worksheetData.push(['=== ADD MORE STAFF BELOW ==='])
    worksheetData.push([])

    // Add 10 empty rows for data entry
    for (let i = 0; i < 10; i++) {
      const emptyRow: any[] = []
      
      // Staff Details columns
      emptyRow.push(`EMP${String(i + 2).padStart(3, '0')}`)
      emptyRow.push('')
      emptyRow.push('')
      emptyRow.push('')
      sections.STAFF_DETAILS.forEach(() => emptyRow.push(''))
      
      // Fixed Earnings columns
      if (sections.FIXED_EARNINGS.length > 0) {
        emptyRow.push('') // Employee ID for Fixed Earnings
        sections.FIXED_EARNINGS.forEach(() => emptyRow.push(''))
      }
      
      // Variable Earnings columns
      if (sections.EARNINGS.length > 0) {
        emptyRow.push('') // Employee ID for Variable Earnings
        sections.EARNINGS.forEach(() => emptyRow.push(''))
      }
      
      // Deductions columns
      if (sections.DEDUCTIONS.length > 0) {
        emptyRow.push('') // Employee ID for Deductions
        sections.DEDUCTIONS.forEach(() => emptyRow.push(''))
      }
      
      worksheetData.push(emptyRow)
    }

    worksheetData.push([])
    worksheetData.push([])

    // INSTRUCTIONS
    worksheetData.push(['=== INSTRUCTIONS ==='])
    worksheetData.push(['1. Do not modify the section headers (=== SECTION NAME ===)'])
    worksheetData.push(['2. Fields marked with * are required'])
    worksheetData.push(['3. Employee ID must match existing employees in the system'])
    worksheetData.push(['4. You can add multiple staff by copying the row structure'])
    worksheetData.push(['5. Keep the Employee ID consistent across sections for each employee'])
    worksheetData.push(['6. Upload the file through the payroll upload endpoint'])
    worksheetData.push([])

    // FIELD LIST
    worksheetData.push(['=== TEMPLATE FIELDS ==='])
    worksheetData.push(['Section', 'Field Name', 'Data Type', 'Required', 'Show on Payslip'])
    
    template.fields.forEach(field => {
      worksheetData.push([
        field.section.replace('_', ' '),
        field.displayName,
        field.dataType,
        field.required ? 'Yes' : 'No',
        field.showOnPayslip ? 'Yes' : 'No'
      ])
    })

    // Set column widths
    const totalCols = Math.max(
      staffDetailHeaders.length,
      (sections.FIXED_EARNINGS.length + 1),
      (sections.EARNINGS.length + 1),
      (sections.DEDUCTIONS.length + 1),
      5
    )

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Payroll Template')

    worksheetData.forEach((row) => {
      worksheet.addRow(row)
    })

    worksheet.columns = Array.from({ length: totalCols }, () => ({ width: 20 }))

    // Generate filename
    const sanitizedCompanyName = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const sanitizedTemplateName = template.templateName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${sanitizedCompanyName}_${sanitizedTemplateName}_template_${timestamp}`

    if (format === 'csv') {
      // Convert to CSV
      const csv = toCsv(worksheetData)
      
      const response = new NextResponse(csv)
      response.headers.set('Content-Type', 'text/csv')
      response.headers.set('Content-Disposition', `attachment; filename="${filename}.csv"`)
      response.headers.set('X-Template-Id', templateId)
      response.headers.set('X-Template-Name', encodeURIComponent(template.templateName))
      return withCors(response, origin)
    } else {
      // Generate Excel file
      const arrayBuffer = await workbook.xlsx.writeBuffer()
      const buffer = Buffer.from(arrayBuffer as ArrayBuffer)
      
      const response = new NextResponse(buffer)
      response.headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      response.headers.set('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
      response.headers.set('X-Template-Id', templateId)
      response.headers.set('X-Template-Name', encodeURIComponent(template.templateName))
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