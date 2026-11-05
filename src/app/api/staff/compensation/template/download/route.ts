// src/app/api/staff/compensation/template/download/route.ts
//
// Downloads a compensation baseline sheet for a company's active staff, with
// one column per payroll template field whose value isn't computed by a
// formula and doesn't already live on the staff record — this is the bridge
// between "what Staff Management already knows about someone" and "what a
// formula computes" for Payroll Generation. Fields marked Manual and Fixed
// Profile both appear here: whatever HR fills in is reused every period
// (Manual fields with nothing saved here still generate blank/flagged,
// exactly like typing it fresh each month). Existing StaffPayrollProfile
// values are pre-filled so re-downloading after a partial rollout doesn't
// lose already-entered data. Part of the new Payroll Generation sub-module —
// does not touch the existing payroll template/upload download routes.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import {
  STAFF_RECORD_DERIVED_SYSTEM_FIELDS,
  PERIOD_DERIVED_SYSTEM_FIELDS,
  GROSS_SYSTEM_FIELD,
  DAYS_WORKED_SYSTEM_FIELD,
  DAYS_WORKED_DISPLAY_NAME
} from '@/app/lib/payroll/generation/field-resolver'
import ExcelJS from 'exceljs'
import { writeStyledTable, buildSubtitle, confidentialFooter, safeFileName, attachmentDisposition, XLSX_MIME } from '@/app/lib/excel/sheet-theme'

type CompensationFieldLike = { systemField: string; displayName: string; dataType: string; required: boolean }

// Gross is a standalone, directly-entered figure (not a computed sum) —
// always offered here regardless of whether the current template declares
// a matching field, so it can be used as a PERCENTAGE base in any template.
const GROSS_FIELD: CompensationFieldLike = { systemField: GROSS_SYSTEM_FIELD, displayName: 'Gross', dataType: 'Number', required: false }

// Fixed the same way Gross is — always offered regardless of template
// config, so attendance proration always has a place to read from.
const DAYS_WORKED_FIELD: CompensationFieldLike = { systemField: DAYS_WORKED_SYSTEM_FIELD, displayName: DAYS_WORKED_DISPLAY_NAME, dataType: 'Days', required: false }

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
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const templateId = searchParams.get('templateId')

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }
    if (!templateId) {
      return withCors(ApiResponse.error('Template selection is required', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const template = await prisma.payrollTemplate.findFirst({
      where: { id: templateId, companyId },
      include: { fields: { orderBy: { order: 'asc' } } }
    })
    if (!template) {
      return withCors(ApiResponse.error('Payroll template not found for this company', 404), origin)
    }

    // Compulsory identity fields (Staff ID, Name, Email, Department) resolve
    // straight from the staff record, and Month always comes from the pay
    // period being generated — neither belongs here. Everything else that
    // isn't computed by a formula (Manual + Fixed Profile) does, plus the
    // standalone Gross figure, which is always offered.
    const templateFields: CompensationFieldLike[] = template.fields.filter(
      (f) =>
        (f.valueSource === 'FIXED_PROFILE' || f.valueSource === 'MANUAL') &&
        !STAFF_RECORD_DERIVED_SYSTEM_FIELDS.includes(f.systemField) &&
        !PERIOD_DERIVED_SYSTEM_FIELDS.includes(f.systemField)
    )
    const profileFields: CompensationFieldLike[] = [GROSS_FIELD, DAYS_WORKED_FIELD, ...templateFields]

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } })

    const staff = await prisma.staffRecord.findMany({
      where: { companyId, isActive: true },
      select: {
        staffId: true,
        firstName: true,
        lastName: true,
        department: true,
        payrollProfile: { select: { values: true } }
      },
      orderBy: [{ department: 'asc' }, { firstName: 'asc' }]
    })

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Staff Compensation')

    // Staff ID is the actual link back to a staff record; Employee Name
    // rides along purely so each row is relatable at a glance, it is not
    // read back in on upload. The header sits on row 4 under the title band;
    // staff/compensation/upload scans the first rows for it.
    const columns = [
      { header: 'Staff ID*', key: 'staffId', width: 22, align: 'left' as const },
      { header: 'Employee Name', key: 'name', width: 26, align: 'left' as const },
      ...profileFields.map((f, i) => ({
        header: f.required ? `${f.displayName}*` : f.displayName,
        key: `f${i}`,
        width: 20,
        align: 'left' as const
      }))
    ]

    writeStyledTable(worksheet, {
      title: `${template.templateName}, Staff Compensation Baseline`,
      subtitle: buildSubtitle([company?.companyName, `${staff.length} active staff`]),
      columns,
      rows: staff.map((s) => {
        const values = (s.payrollProfile?.values as Record<string, unknown>) || {}
        const row: Record<string, any> = { staffId: s.staffId, name: `${s.firstName} ${s.lastName}` }
        profileFields.forEach((f, i) => {
          const raw = values[f.systemField]
          row[`f${i}`] = raw === undefined || raw === null ? '' : (raw as any)
        })
        return row
      }),
      emptyMessage: 'No active staff found for this company',
      footer: confidentialFooter(company?.companyName)
    })

    const referenceSheet = workbook.addWorksheet('Instructions')
    writeStyledTable(referenceSheet, {
      title: 'Instructions',
      subtitle: buildSubtitle([company?.companyName, template.templateName]),
      columns: [
        { header: 'Field Name', key: 'name', width: 34, align: 'left' },
        { header: 'Data Type', key: 'type', width: 20, align: 'left' },
        { header: 'Required', key: 'required', width: 14, align: 'center' }
      ],
      rows: profileFields.map((f) => ({ name: f.displayName, type: f.dataType, required: f.required ? 'Yes' : 'No' })),
      autoFilter: false,
      notes: {
        heading: 'How to fill this sheet',
        lines: [
          '1. Do not modify the header row or the Staff ID column.',
          '2. Staff ID must match an existing active staff record.',
          '3. Fields marked with * are required.',
          "4. Leave a field blank to leave that staff member's existing value unchanged.",
          '5. Upload the completed sheet from the Staff Compensation Upload page.'
        ]
      },
      footer: confidentialFooter(company?.companyName)
    })

    const filename = `Staff Compensation (${safeFileName(company?.companyName || 'Company')}) ${new Date().toISOString().split('T')[0]}.xlsx`

    const arrayBuffer = await workbook.xlsx.writeBuffer()
    const uint8Array = new Uint8Array(arrayBuffer as ArrayBuffer)

    const response = new NextResponse(uint8Array, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': attachmentDisposition(filename),
        'X-Template-Id': templateId
      }
    })
    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
