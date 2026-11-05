// src/app/api/staff/[id]/compensation/route.ts
//
// Single-staff read/update of StaffPayrollProfile — the recurring
// compensation baseline used by Payroll Generation. Powers the
// "Compensation" section added to the existing Staff Management edit/view
// drawers. GET returns the company's Manual + Fixed Profile fields (from
// the given or existing template) alongside this staff member's current
// values so the drawer can render one form; PATCH merges a partial values
// update. Whatever's saved here is reused every pay period regardless of
// which of the two a field is nominally marked as.
import { NextRequest } from 'next/server'
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

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, staffId: true, payrollProfile: { select: { values: true, templateId: true, updatedBy: true, updatedAt: true } } }
    })
    if (!staffRecord) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, staffRecord.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const { searchParams } = new URL(request.url)
    const requestedTemplateId = searchParams.get('templateId') || staffRecord.payrollProfile?.templateId || null

    const template = requestedTemplateId
      ? await prisma.payrollTemplate.findFirst({
          where: { id: requestedTemplateId, companyId: staffRecord.companyId },
          include: { fields: { orderBy: { order: 'asc' } } }
        })
      : await prisma.payrollTemplate.findFirst({
          where: { companyId: staffRecord.companyId },
          include: { fields: { orderBy: { order: 'asc' } } }
        })

    if (!template) {
      return withCors(
        ApiResponse.success(
          { templateId: null, templateName: null, fields: [], updatedBy: null, updatedAt: null },
          'No payroll template configured for this company yet'
        ),
        origin
      )
    }

    const profileValues = (staffRecord.payrollProfile?.values as Record<string, unknown> | undefined) || {}
    const sameTemplate = staffRecord.payrollProfile?.templateId === template.id

    const templateFields = template.fields
      // Compulsory identity fields resolve straight from the staff record,
      // and Month always comes from the pay period being generated —
      // neither belongs here. Manual + Fixed Profile fields both do: a
      // saved value here is reused every period regardless of which of the
      // two a field is nominally marked as.
      .filter(
        (f) =>
          (f.valueSource === 'FIXED_PROFILE' || f.valueSource === 'MANUAL') &&
          !STAFF_RECORD_DERIVED_SYSTEM_FIELDS.includes(f.systemField) &&
          !PERIOD_DERIVED_SYSTEM_FIELDS.includes(f.systemField)
      )
      .map((f) => ({
        systemField: f.systemField,
        displayName: f.displayName,
        dataType: f.dataType,
        section: f.section,
        required: f.required,
        value: sameTemplate ? profileValues[f.systemField] ?? null : null
      }))

    // Gross is a standalone, directly-entered figure — always offered here
    // regardless of the template, so it can be used as a PERCENTAGE base.
    // Number of days worked is fixed the same way — always offered so
    // attendance proration always has a place to read from.
    const fields = [
      {
        systemField: GROSS_SYSTEM_FIELD,
        displayName: 'Gross',
        dataType: 'Number',
        section: 'FIXED_VALUES',
        required: false,
        value: profileValues[GROSS_SYSTEM_FIELD] ?? null
      },
      {
        systemField: DAYS_WORKED_SYSTEM_FIELD,
        displayName: DAYS_WORKED_DISPLAY_NAME,
        dataType: 'Days',
        section: 'ATTENDANCE',
        required: false,
        value: profileValues[DAYS_WORKED_SYSTEM_FIELD] ?? null
      },
      ...templateFields
    ]

    return withCors(
      ApiResponse.success(
        {
          templateId: template.id,
          templateName: template.templateName,
          fields,
          updatedBy: sameTemplate ? staffRecord.payrollProfile?.updatedBy || null : null,
          updatedAt: sameTemplate ? staffRecord.payrollProfile?.updatedAt || null : null
        },
        'Compensation profile retrieved'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const body = await request.json()
    const { templateId, values } = body as { templateId?: string; values?: Record<string, unknown> }

    if (!templateId) {
      return withCors(ApiResponse.error('templateId is required', 400), origin)
    }
    if (!values || typeof values !== 'object') {
      return withCors(ApiResponse.error('values object is required', 400), origin)
    }

    const staffRecord = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true }
    })
    if (!staffRecord) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, staffRecord.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const template = await prisma.payrollTemplate.findFirst({
      where: { id: templateId, companyId: staffRecord.companyId },
      include: {
        fields: {
          where: {
            valueSource: { in: ['FIXED_PROFILE', 'MANUAL'] },
            systemField: { notIn: [...STAFF_RECORD_DERIVED_SYSTEM_FIELDS, ...PERIOD_DERIVED_SYSTEM_FIELDS] }
          }
        }
      }
    })
    if (!template) {
      return withCors(ApiResponse.error('Payroll template not found for this company', 404), origin)
    }

    const allowedFields = new Map<string, { systemField: string; displayName: string; dataType: string }>(
      template.fields.map((f) => [f.systemField, f])
    )
    // Gross is a standalone, directly-entered figure — always writable here
    // regardless of the template. Number of days worked is fixed the same
    // way.
    allowedFields.set(GROSS_SYSTEM_FIELD, { systemField: GROSS_SYSTEM_FIELD, displayName: 'Gross', dataType: 'Number' })
    allowedFields.set(DAYS_WORKED_SYSTEM_FIELD, { systemField: DAYS_WORKED_SYSTEM_FIELD, displayName: DAYS_WORKED_DISPLAY_NAME, dataType: 'Days' })
    const coerced: Record<string, number | string | null> = {}

    for (const [systemField, raw] of Object.entries(values)) {
      const field = allowedFields.get(systemField)
      if (!field) continue // ignore keys that aren't Fixed Profile fields on this template
      if (raw === null || raw === '' || raw === undefined) {
        coerced[systemField] = null
        continue
      }
      if (field.dataType === 'Number') {
        const n = Number(raw)
        if (!Number.isFinite(n)) {
          return withCors(ApiResponse.error(`"${field.displayName}" must be a number`, 400), origin)
        }
        coerced[systemField] = n
      } else {
        coerced[systemField] = String(raw)
      }
    }

    const existing = await prisma.staffPayrollProfile.findUnique({ where: { staffId: staffRecord.id } })
    const mergedValues: Record<string, any> = { ...(existing?.values as Record<string, unknown> | undefined), ...coerced }

    const profile = await prisma.staffPayrollProfile.upsert({
      where: { staffId: staffRecord.id },
      create: {
        staffId: staffRecord.id,
        companyId: staffRecord.companyId,
        templateId,
        values: mergedValues,
        updatedBy: user.userId
      },
      update: {
        templateId,
        values: mergedValues,
        updatedBy: user.userId
      }
    })

    return withCors(ApiResponse.success(profile, 'Compensation profile updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
