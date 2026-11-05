// src/app/api/payroll/payslip-presets/[id]/route.ts
//
// Single PayslipPreset operations: GET (with full HTML), PUT (update),
// DELETE (blocked while in use by a template), and POST ?action=preview
// which renders the preset with sample data to a PDF for visual check.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePresetHtml, buildSampleContext, interpolatePresetHtml, renderPresetHtmlToPdf } from '@/app/lib/payroll/payslip-preset-renderer'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

async function verifyCompanyAccess(user: { userId: string; role: string }, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  const userCompany = await prisma.userCompany.findFirst({
    where: { userId: user.userId, companyId, OR: [{ role: user.role }, { role: 'ALL' }] }
  })
  return !!userCompany
}

// ---------- GET: fetch one preset, full HTML included ----------
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { id } = await params
    const preset = await prisma.payslipPreset.findUnique({ where: { id } })
    if (!preset) return withCors(ApiResponse.error('Payslip preset not found', 404), origin)

    if (!(await verifyCompanyAccess(user, preset.companyId))) {
      return withCors(ApiResponse.error('Access denied to this company', 403), origin)
    }

    return withCors(ApiResponse.success(preset, 'Payslip preset retrieved successfully'), origin)
  } catch (error) {
    console.error('Error fetching payslip preset:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// ---------- PUT: update ----------
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { id } = await params
    const preset = await prisma.payslipPreset.findUnique({ where: { id } })
    if (!preset) return withCors(ApiResponse.error('Payslip preset not found', 404), origin)

    if (!(await verifyCompanyAccess(user, preset.companyId))) {
      return withCors(ApiResponse.error('Access denied to this company', 403), origin)
    }

    const body = await request.json()
    const { name, description, htmlContent, isActive } = body || {}

    if (htmlContent !== undefined) {
      const validation = validatePresetHtml(String(htmlContent))
      if (!validation.ok) return withCors(ApiResponse.error(validation.reason, 400), origin)
    }

    const updated = await prisma.payslipPreset.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
        ...(htmlContent !== undefined ? { htmlContent: String(htmlContent) } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        updatedBy: user.userId
      },
      select: { id: true, name: true, isActive: true, updatedAt: true }
    })

    return withCors(ApiResponse.success(updated, 'Payslip preset updated successfully'), origin)
  } catch (error) {
    console.error('Error updating payslip preset:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// ---------- POST: action=preview (sample-data PDF) ----------
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { id } = await params
    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    // Preview accepts either a saved preset id OR an unsaved htmlContent body
    // so the editor can preview before saving.
    let html: string | null = null
    if (id !== 'preview') {
      const preset = await prisma.payslipPreset.findUnique({ where: { id } })
      if (!preset) return withCors(ApiResponse.error('Payslip preset not found', 404), origin)
      if (!(await verifyCompanyAccess(user, preset.companyId))) {
        return withCors(ApiResponse.error('Access denied to this company', 403), origin)
      }
      html = preset.htmlContent
    }

    if (action === 'preview') {
      // Unsaved draft preview: body may carry htmlContent; companyId in the
      // body proves which company the caller is acting for.
      const body = await request.json().catch(() => ({}))
      if (body?.htmlContent) {
        if (body.companyId) {
          if (!(await verifyCompanyAccess(user, body.companyId))) {
            return withCors(ApiResponse.error('Access denied to this company', 403), origin)
          }
        } else if (id === 'preview') {
          return withCors(ApiResponse.error('companyId is required to preview unsaved HTML', 400), origin)
        }
        const validation = validatePresetHtml(String(body.htmlContent))
        if (!validation.ok) return withCors(ApiResponse.error(validation.reason, 400), origin)
        html = String(body.htmlContent)
      }
      if (!html) return withCors(ApiResponse.error('No HTML to preview', 400), origin)

      const ctx = buildSampleContext()
      const htmlFinal = interpolatePresetHtml(html, ctx)
      const pdf = await renderPresetHtmlToPdf(htmlFinal)
      return new Response(Buffer.from(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="payslip-preset-preview.pdf"',
          'Access-Control-Allow-Origin': origin || '*'
        }
      })
    }

    return withCors(ApiResponse.error('Unknown action', 400), origin)
  } catch (error) {
    console.error('Error in payslip preset POST:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// ---------- DELETE: remove (blocked while in use) ----------
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { id } = await params
    const preset = await prisma.payslipPreset.findUnique({
      where: { id },
      include: { _count: { select: { payrollTemplates: true } } }
    })
    if (!preset) return withCors(ApiResponse.error('Payslip preset not found', 404), origin)

    if (!(await verifyCompanyAccess(user, preset.companyId))) {
      return withCors(ApiResponse.error('Access denied to this company', 403), origin)
    }

    if (preset._count.payrollTemplates > 0) {
      return withCors(
        ApiResponse.error(
          `This preset is in use by ${preset._count.payrollTemplates} payroll template(s). Detach it from those templates first.`,
          409
        ),
        origin
      )
    }

    await prisma.payslipPreset.delete({ where: { id } })
    return withCors(ApiResponse.success(null, 'Payslip preset deleted successfully'), origin)
  } catch (error) {
    console.error('Error deleting payslip preset:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
