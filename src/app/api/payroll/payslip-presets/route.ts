// src/app/api/payroll/payslip-presets/route.ts
//
// Company-scoped Payslip Preset management: CRUD for HTML payslip layouts
// plus a sample-data PDF preview so a preset can be visually verified
// before it is attached to a payroll template. SUPER_ADMIN may manage any
// company's presets; ADMIN/HR only their own (UserCompany check).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePresetHtml } from '@/app/lib/payroll/payslip-preset-renderer'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// ---------- helpers ----------
async function verifyCompanyAccess(user: { userId: string; role: string }, companyId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  const userCompany = await prisma.userCompany.findFirst({
    where: { userId: user.userId, companyId, OR: [{ role: user.role }, { role: 'ALL' }] }
  })
  return !!userCompany
}

// ---------- GET: list presets for a company ----------
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(ApiResponse.error('Access denied to this company', 403), origin)
    }

    const presets = await prisma.payslipPreset.findMany({
      where: { companyId },
      select: {
        id: true, name: true, description: true, isActive: true, isSeed: true,
        htmlContent: true, createdAt: true, updatedAt: true,
        _count: { select: { payrollTemplates: true } }
      },
      orderBy: [{ isSeed: 'desc' }, { createdAt: 'desc' }]
    })

    // Never leak full HTML in list responses - send length only.
    const data = presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isActive: p.isActive,
      isSeed: p.isSeed,
      htmlLength: p.htmlContent.length,
      templatesUsing: p._count.payrollTemplates,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }))

    return withCors(ApiResponse.success(data, 'Payslip presets retrieved successfully'), origin)
  } catch (error) {
    console.error('Error listing payslip presets:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}

// ---------- POST: create a preset ----------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const body = await request.json()
    const { companyId, name, description, htmlContent, isActive } = body || {}
    if (!companyId || !name || !htmlContent) {
      return withCors(ApiResponse.error('companyId, name and htmlContent are required', 400), origin)
    }
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(ApiResponse.error('Access denied to this company', 403), origin)
    }

    const validation = validatePresetHtml(String(htmlContent))
    if (!validation.ok) {
      return withCors(ApiResponse.error(validation.reason, 400), origin)
    }

    const preset = await prisma.payslipPreset.create({
      data: {
        companyId,
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        htmlContent: String(htmlContent),
        isActive: isActive === undefined ? true : Boolean(isActive),
        isSeed: false,
        createdBy: user.userId
      },
      select: { id: true, name: true, isActive: true, createdAt: true }
    })

    return withCors(ApiResponse.success(preset, 'Payslip preset created successfully'), origin)
  } catch (error) {
    console.error('Error creating payslip preset:', error)
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
