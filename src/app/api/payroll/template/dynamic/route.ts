// src/app/api/payroll/templates/dynamic/route.ts
import { assertTrialCapacity, trialErrorBody } from '@/app/lib/trial/guard'
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { RENT_PAID_BANDS_CALCULATOR, BASE_PERCENTAGE_CALCULATORS, CALC_BASE_OVERRIDES, NHF_CALCULATOR, NHF_BASES } from '@/app/lib/payroll/generation/field-resolver'
import { MANUAL_PENSION_CAPTURE_FIELDS } from '@/app/lib/staff/pension-fields'
import { ensureSystemPayrollTemplates } from '@/app/lib/payroll/seed-system-payroll-templates'

function normalizeTemplateSectionKey(sectionName: string): string {
  const normalized = sectionName
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  // 'FIXED_VALUES' is the canonical key (matches the frontend form sections
  // and the field-resolver); the singular 'FIXED_VALUE' spelling is accepted
  // for backwards compatibility with older stored payloads.
  if (normalized === 'FIXED_VALUE' || normalized === 'FIXED_VALUES') return 'FIXED_VALUES'
  if (normalized === 'FIXED_EARNINGS') return 'FIXED_EARNINGS'
  if (normalized === 'STAFF_DETAILS') return 'STAFF_DETAILS'
  if (normalized === 'EARNINGS') return 'EARNINGS'
  if (normalized === 'DEDUCTIONS') return 'DEDUCTIONS'
  if (normalized === 'EMPLOYER_COST') return 'EMPLOYER_COST'

  return normalized
}

function normalizeTemplateSections(sections: any): Record<string, any[]> {
  const normalizedSections: Record<string, any[]> = {
    STAFF_DETAILS: [],
    FIXED_EARNINGS: [],
    FIXED_VALUES: [],
    EARNINGS: [],
    DEDUCTIONS: [],
    EMPLOYER_COST: []
  }

  Object.entries(sections || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeTemplateSectionKey(key)
    if (!(normalizedKey in normalizedSections)) return
    normalizedSections[normalizedKey] = Array.isArray(value) ? value : []
  })

  return normalizedSections
}

// Client billing — opt-in per template (see schema comment on
// PayrollTemplate.payrollInvoicingEnabled). Returns null on an invalid
// percentage so the caller can 400 rather than silently save garbage.
function normalizeBillingFields(body: any): { data: Record<string, any>; error: string | null } {
  const data: Record<string, any> = {}
  if (body.payrollInvoicingEnabled !== undefined) data.payrollInvoicingEnabled = !!body.payrollInvoicingEnabled

  for (const field of ['payrollManagementFeePercent', 'payrollVatPercent']) {
    if (body[field] === undefined) continue
    if (body[field] === '' || body[field] === null) {
      data[field] = null
      continue
    }
    const n = Number(body[field])
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { data, error: `${field} must be a number between 0 and 100` }
    }
    data[field] = n
  }

  return { data, error: null }
}

// Pension/NSITF calculation base — opt-in per template (see schema comment
// on PayrollTemplate.pensionCalculationBase). Returns an error on anything
// other than the two legal values so a typo never silently saves as BHT.
function normalizeCalculationBaseField(body: any): { data: Record<string, any>; error: string | null } {
  const data: Record<string, any> = {}
  if (body.pensionCalculationBase !== undefined) {
    const value = String(body.pensionCalculationBase || '').toUpperCase()
    if (value !== 'BHT' && value !== 'STANDARD') {
      return { data, error: `pensionCalculationBase must be "BHT" or "STANDARD"` }
    }
    data.pensionCalculationBase = value
  }
  return { data, error: null }
}

// Payroll Generation — a PERCENTAGE field's formulaConfig.percent is its
// share of whatever it's `of` (Gross Earnings, the Compensation Profile's
// "gross", or another field). Every pool of percentage fields sharing the
// same `of` within the income section (Fixed Income / Earnings) must land
// on exactly 100%, otherwise a generated payroll silently under- or
// over-composes gross pay. Mirrors the frontend guard in
// frontend/src/hooks/use-templateManager.js's isFormValid — re-checked here
// since this route is the only server-side gate before fields are persisted.
function validateIncomePercentages(sections: Record<string, any[]>): string | null {
  const isEarningsSection = (section: string) => /EARNING/i.test(section || '')
  const totals = new Map<string, number>()

  Object.entries(sections || {}).forEach(([section, sectionFields]) => {
    if (!isEarningsSection(section)) return
    ;(sectionFields || []).forEach((field: any) => {
      if (field.valueSource !== 'PERCENTAGE') return
      const of = field.formulaConfig?.of || 'GROSS_EARNINGS'
      const percent = Number(field.formulaConfig?.percent) || 0
      totals.set(of, (totals.get(of) || 0) + percent)
    })
  })

  for (const [of, total] of totals.entries()) {
    const rounded = Math.round(total * 100) / 100
    if (rounded !== 100) {
      const label = of === 'GROSS_EARNINGS' ? 'Gross Earnings' : of === 'gross' ? 'Gross' : of
      return `Income section: Percentage fields for "${label}" total ${rounded}%, not 100%. Adjust the percentages so they add up to exactly 100%.`
    }
  }
  return null
}

// Rent Paid band calculator (NIGERIA_RENT_PAID_BANDS): the table HR edits in
// the template builder. Every row needs a positive monthly gross and a
// non-negative annual rent, with no two rows sharing the same gross. Rows
// are stored sorted by gross so the template details view and the resolver
// read them in order. Mutates the section fields in place.
function normalizeRentBandFields(sections: Record<string, any[]>): string | null {
  for (const sectionFields of Object.values(sections || {})) {
    for (const field of sectionFields || []) {
      if (field.valueSource !== 'SYSTEM_CALC' || field.formulaConfig?.calculator !== RENT_PAID_BANDS_CALCULATOR) continue
      const label = field.displayName || field.systemField || 'Rent Paid'
      const rows = Array.isArray(field.formulaConfig.rentBands) ? field.formulaConfig.rentBands : []
      if (rows.length === 0) return `${label}: add at least one rent band.`
      const bands = rows.map((r: any) => ({ minGross: Number(r?.minGross), annualRent: Number(r?.annualRent) }))
      if (bands.some((b: any) => !Number.isFinite(b.minGross) || b.minGross <= 0)) return `${label}: every band needs a gross greater than 0.`
      if (bands.some((b: any) => !Number.isFinite(b.annualRent) || b.annualRent < 0)) return `${label}: every band needs a rent paid of 0 or more.`
      const grossValues = bands.map((b: any) => b.minGross)
      if (new Set(grossValues).size !== grossValues.length) return `${label}: two bands share the same gross. Each gross can only appear once.`
      const below = field.formulaConfig.belowLowestRent
      const belowLowestRent = below === undefined || below === null || below === '' ? 0 : Number(below)
      if (!Number.isFinite(belowLowestRent) || belowLowestRent < 0) return `${label}: the rent below the lowest band must be 0 or more.`
      field.formulaConfig = { ...field.formulaConfig, rentBands: bands.sort((x: any, y: any) => x.minGross - y.minGross), belowLowestRent }
    }
  }
  return null
}

// Per-field base override on base-percentage calculators (Pension, NSITF,
// ITF): only 'BHT' or 'GROSS' are kept; anything else (including the
// "follow the template" choice) is dropped so the field follows the toggle.
function normalizeCalcBaseOverrides(sections: Record<string, any[]>): void {
  for (const sectionFields of Object.values(sections || {})) {
    for (const field of sectionFields || []) {
      if (field.valueSource !== 'SYSTEM_CALC' || !field.formulaConfig || !('base' in field.formulaConfig)) continue
      const base = String(field.formulaConfig.base || '').toUpperCase()
      const calculator = field.formulaConfig.calculator
      const allowed = calculator === NHF_CALCULATOR ? (NHF_BASES as string[]) : BASE_PERCENTAGE_CALCULATORS.includes(calculator) ? (CALC_BASE_OVERRIDES as string[]) : []
      if (allowed.includes(base)) {
        field.formulaConfig = { ...field.formulaConfig, base }
      } else {
        const rest = { ...field.formulaConfig }
        delete rest.base
        field.formulaConfig = rest
      }
    }
  }
}

const PENSION_SYSTEM_CALCULATORS = ['NIGERIA_PENSION_EMPLOYEE', 'NIGERIA_PENSION_EMPLOYER']

// Auto-provisions the 4 manual pension-capture fields (see
// MANUAL_PENSION_CAPTURE_FIELDS) into FIXED_VALUES whenever either pension
// SYSTEM_CALC calculator is present anywhere in the template — the template
// already signals "this company runs pension" via those calculators, so HR
// shouldn't have to remember to add the capture fields too. Skips any
// canonical systemField already present anywhere in the template (hand-added
// via the builder's fallback button, or from a prior save), and never
// removes them once added — even if the pension calculator is later dropped,
// so any values already captured are never silently orphaned.
function ensureManualPensionFields(sections: Record<string, any[]>): void {
  const hasPensionCalculator = Object.values(sections).some((fields) =>
    (fields || []).some((f: any) => f.valueSource === 'SYSTEM_CALC' && PENSION_SYSTEM_CALCULATORS.includes(f.formulaConfig?.calculator))
  )
  if (!hasPensionCalculator) return

  const existingSystemFields = new Set(Object.values(sections).flatMap((fields) => (fields || []).map((f: any) => f.systemField)))

  const toAdd = MANUAL_PENSION_CAPTURE_FIELDS.filter((f) => !existingSystemFields.has(f.systemField))
  if (toAdd.length === 0) return

  if (!sections.FIXED_VALUES) sections.FIXED_VALUES = []
  for (const f of toAdd) {
    sections.FIXED_VALUES.push({
      displayName: f.displayName,
      systemField: f.systemField,
      dataType: f.dataType,
      required: false,
      showOnPayslip: false,
      valueSource: 'MANUAL',
      formulaConfig: null,
      aliases: [],
    })
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Get all dynamic templates for a company
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
    const companyId = searchParams.get('companyId')
    const includeSystem = searchParams.get('includeSystem') === 'true'

    if (!companyId) {
      return withCors(ApiResponse.error('Company ID is required', 400), origin)
    }

    // Verify user has access to this company
    if (user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this company', 403), origin)
      }
    }

    // Build where clause
    const where: any = {
      OR: [{ companyId }]
    }

    // Include system templates if requested (available to all companies)
    if (includeSystem) {
      // Built-in ISURF_STANDARD / BLUERIDGE rows come out of the box —
      // created on first use if this database doesn't have them yet.
      await ensureSystemPayrollTemplates()
      where.OR.push({ isSystem: true })
    }

    const templates = await prisma.payrollTemplate.findMany({
      where,
      include: {
        fields: {
          orderBy: { order: 'asc' }
        },
        _count: {
          select: {
            payrolls: true,
            payrollData: true
          }
        }
      },
      orderBy: [
        { isSystem: 'desc' }, // System templates first
        { createdAt: 'desc' }
      ]
    })

    return withCors(
      ApiResponse.success(templates, 'Templates retrieved successfully'),
      origin
    )

  } catch (error) {
    console.error('Error fetching templates:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// Create new dynamic template
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const body = await request.json()
    const {
      companyId,
      templateName,
      sections,
      isSystem = false,
      payslipCompanyName,
      payslipPresetId
    } = body

    const normalizedSections = normalizeTemplateSections(sections)
    ensureManualPensionFields(normalizedSections)
    const billing = normalizeBillingFields(body)
    if (billing.error) {
      return withCors(ApiResponse.error(billing.error, 400), origin)
    }
    const calcBase = normalizeCalculationBaseField(body)
    if (calcBase.error) {
      return withCors(ApiResponse.error(calcBase.error, 400), origin)
    }

    // Validation
    if (!companyId) {
      return withCors(ApiResponse.error('Company ID is required', 400), origin)
    }

    if (!templateName || templateName.trim().length === 0) {
      return withCors(ApiResponse.error('Template name is required', 400), origin)
    }

    if (!sections || typeof sections !== 'object') {
      return withCors(ApiResponse.error('Template sections are required', 400), origin)
    }

    const percentageError = validateIncomePercentages(normalizedSections)
    if (percentageError) {
      return withCors(ApiResponse.error(percentageError, 400), origin)
    }
    const rentBandError = normalizeRentBandFields(normalizedSections)
    normalizeCalcBaseOverrides(normalizedSections)
    if (rentBandError) {
      return withCors(ApiResponse.error(rentBandError, 400), origin)
    }

    // Payslip preset (optional): must belong to this company so a template
    // can never reference another company's payslip layout.
    let resolvedPayslipPresetId: string | null = null
    if (payslipPresetId) {
      const preset = await prisma.payslipPreset.findUnique({ where: { id: payslipPresetId } })
      if (!preset) {
        return withCors(ApiResponse.error('Payslip preset not found', 404), origin)
      }
      if (preset.companyId !== companyId) {
        return withCors(ApiResponse.error('Payslip preset does not belong to this company', 400), origin)
      }
      resolvedPayslipPresetId = preset.id
    }

    // Only SUPER_ADMIN can create system templates
    if (isSystem && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Only SUPER_ADMIN can create system templates', 403), origin)
    }

    // Verify user has access to this company (unless it's a system template)
    if (!isSystem && user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this company', 403), origin)
      }
    }

    // Check if template already exists for this company
    const existingTemplate = await prisma.payrollTemplate.findFirst({
      where: {
        companyId: isSystem ? undefined : companyId,
        templateName: {
          equals: templateName,
          mode: 'insensitive'
        },
        ...(isSystem ? { isSystem: true } : {})
      }
    })

    if (existingTemplate) {
      return withCors(
        ApiResponse.error(`Template with name "${templateName}" already exists`, 400),
        origin
      )
    }

    if (!isSystem) await assertTrialCapacity(companyId, 'payrollTemplates')

    // Create template with fields in a transaction
    const template = await prisma.$transaction(async (tx) => {
      // Create the template
      const newTemplate = await tx.payrollTemplate.create({
        data: {
          companyId: isSystem ? 'SYSTEM' : companyId, // Use 'SYSTEM' as placeholder for system templates
          templateName,
          sections: normalizedSections,
          isSystem,
          payslipCompanyName: payslipCompanyName?.trim() || null,
          payslipPresetId: resolvedPayslipPresetId,
          createdBy: user.userId,
          ...billing.data,
          ...calcBase.data
        }
      })

      // Create fields
      const fields: any[] = []
      let order = 0

      // Expected sections
      const sectionOrder = ['STAFF_DETAILS', 'FIXED_EARNINGS', 'FIXED_VALUES', 'EARNINGS', 'DEDUCTIONS', 'EMPLOYER_COST']

      for (const sectionName of sectionOrder) {
        const sectionFields = normalizedSections[sectionName] || []
        
        for (const field of sectionFields) {
          // Validate required field properties
          if (!field.displayName) {
            throw new Error(`Field display name is required in section ${sectionName}`)
          }

          if (!field.systemField) {
            // Generate system field from display name if not provided
            field.systemField = field.displayName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
          }

          fields.push({
            templateId: newTemplate.id,
            section: sectionName,
            displayName: field.displayName,
            systemField: field.systemField,
            dataType: field.dataType || 'Text',
            required: field.required || false,
            aliases: field.aliases || [],
            showOnPayslip: field.showOnPayslip || false,
            order: order++,
            createdBy: user.userId,
            // Payroll Generation (additive) — how this field resolves when
            // auto-generating instead of being read from an uploaded cell.
            // Defaults to MANUAL, matching today's fully-manual behavior.
            // formulaConfig is only meaningful for PERCENTAGE/SYSTEM_CALC — nulled
            // out otherwise so a field switched away from one of those doesn't keep
            // carrying a stale "X% of Gross" config that the UI could later surface
            // even though it no longer drives the value.
            valueSource: field.valueSource || 'MANUAL',
            formulaConfig: field.valueSource === 'PERCENTAGE' || field.valueSource === 'SYSTEM_CALC' ? field.formulaConfig ?? null : null
          })
        }
      }

      if (fields.length > 0) {
        await tx.payrollTemplateField.createMany({
          data: fields
        })
      }

      // Return template with fields
      return await tx.payrollTemplate.findUnique({
        where: { id: newTemplate.id },
        include: {
          fields: {
            orderBy: { order: 'asc' }
          }
        }
      })
    })

    return withCors(
      ApiResponse.success(template, 'Template created successfully'),
      origin
    )

  } catch (error) {
    const trial = trialErrorBody(error)
    if (trial) return withCors(ApiResponse.error(trial.message, trial.status, undefined, { trialCode: trial.code }), origin)
    console.error('Error creating template:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// Update existing template
export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const body = await request.json()
    const {
      templateId,
      templateName,
      sections,
      payslipCompanyName,
      payslipPresetId
    } = body

    const normalizedSections = sections ? normalizeTemplateSections(sections) : null
    if (normalizedSections) ensureManualPensionFields(normalizedSections)
    const billing = normalizeBillingFields(body)
    if (billing.error) {
      return withCors(ApiResponse.error(billing.error, 400), origin)
    }
    const calcBase = normalizeCalculationBaseField(body)
    if (calcBase.error) {
      return withCors(ApiResponse.error(calcBase.error, 400), origin)
    }

    if (!templateId) {
      return withCors(ApiResponse.error('Template ID is required', 400), origin)
    }

    if (normalizedSections) {
      const percentageError = validateIncomePercentages(normalizedSections)
      if (percentageError) {
        return withCors(ApiResponse.error(percentageError, 400), origin)
      }
      const rentBandError = normalizeRentBandFields(normalizedSections)
      normalizeCalcBaseOverrides(normalizedSections)
      if (rentBandError) {
        return withCors(ApiResponse.error(rentBandError, 400), origin)
      }
    }

    // Get existing template
    const existingTemplate = await prisma.payrollTemplate.findUnique({
      where: { id: templateId },
      include: { fields: true }
    })

    if (!existingTemplate) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    // Check permissions
    if (!existingTemplate.isSystem && user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, existingTemplate.companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this template', 403), origin)
      }
    }

    // Payslip preset (optional): '' or null clears the selection (falls back
    // to the default system layout); a real id must belong to the template's
    // company so a template can never reference another company's layout.
    if (payslipPresetId !== undefined && payslipPresetId) {
      const preset = await prisma.payslipPreset.findUnique({ where: { id: payslipPresetId } })
      if (!preset) {
        return withCors(ApiResponse.error('Payslip preset not found', 404), origin)
      }
      if (preset.companyId !== existingTemplate.companyId) {
        return withCors(ApiResponse.error('Payslip preset does not belong to this company', 400), origin)
      }
    }

    // Update template in transaction
    const template = await prisma.$transaction(async (tx) => {
      // Delete existing fields
      await tx.payrollTemplateField.deleteMany({
        where: { templateId }
      })

      // Update template
      const updatedTemplate = await tx.payrollTemplate.update({
        where: { id: templateId },
        data: {
          templateName: templateName || existingTemplate.templateName,
          sections: normalizedSections ? (normalizedSections as any) : ((existingTemplate.sections ?? {}) as any),
          payslipCompanyName: payslipCompanyName !== undefined ? payslipCompanyName?.trim() || null : existingTemplate.payslipCompanyName,
          payslipPresetId: payslipPresetId !== undefined ? payslipPresetId || null : existingTemplate.payslipPresetId,
          ...billing.data,
          ...calcBase.data,
          updatedBy: user.userId,
          updatedAt: new Date()
        }
      })

      // Create new fields if provided
      if (normalizedSections) {
        const fields: any[] = []
        let order = 0

        const sectionOrder = ['STAFF_DETAILS', 'FIXED_EARNINGS', 'FIXED_VALUES', 'EARNINGS', 'DEDUCTIONS', 'EMPLOYER_COST']

        for (const sectionName of sectionOrder) {
          const sectionFields = normalizedSections[sectionName] || []
          
          for (const field of sectionFields) {
            fields.push({
              templateId: updatedTemplate.id,
              section: sectionName,
              displayName: field.displayName,
              systemField: field.systemField || field.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
              dataType: field.dataType || 'Text',
              required: field.required || false,
              aliases: field.aliases || [],
              showOnPayslip: field.showOnPayslip || false,
              order: order++,
              createdBy: user.userId,
              // See the create-path comment above — formulaConfig only kept for
              // PERCENTAGE/SYSTEM_CALC fields so switching a field's source away
              // from one of those can't leave a stale percent-of-gross behind.
              valueSource: field.valueSource || 'MANUAL',
              formulaConfig: field.valueSource === 'PERCENTAGE' || field.valueSource === 'SYSTEM_CALC' ? field.formulaConfig ?? null : null
            })
          }
        }

        if (fields.length > 0) {
          await tx.payrollTemplateField.createMany({
            data: fields
          })
        }
      }

      return await tx.payrollTemplate.findUnique({
        where: { id: templateId },
        include: {
          fields: {
            orderBy: { order: 'asc' }
          }
        }
      })
    })

    return withCors(
      ApiResponse.success(template, 'Template updated successfully'),
      origin
    )

  } catch (error) {
    console.error('Error updating template:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// Delete template
export async function DELETE(request: NextRequest) {
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

    if (!templateId) {
      return withCors(ApiResponse.error('Template ID is required', 400), origin)
    }

    // Get template
    const template = await prisma.payrollTemplate.findUnique({
      where: { id: templateId },
      include: {
        _count: {
          select: {
            payrolls: true,
            payrollData: true
          }
        }
      }
    })

    if (!template) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    // Check if template is in use
    if (template._count.payrolls > 0 || template._count.payrollData > 0) {
      return withCors(
        ApiResponse.error('Cannot delete template that has been used for payroll processing', 400),
        origin
      )
    }

    // Check permissions
    if (!template.isSystem && user.role !== 'SUPER_ADMIN') {
      const hasAccess = await verifyCompanyAccess(user, template.companyId)
      if (!hasAccess) {
        return withCors(ApiResponse.error('Access denied to this template', 403), origin)
      }
    }

    // Delete template (cascades to fields)
    await prisma.payrollTemplate.delete({
      where: { id: templateId }
    })

    return withCors(
      ApiResponse.success(null, 'Template deleted successfully'),
      origin
    )

  } catch (error) {
    console.error('Error deleting template:', error)
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