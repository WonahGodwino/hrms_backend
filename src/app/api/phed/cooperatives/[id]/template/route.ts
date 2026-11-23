import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { buildMembershipTemplate } from '@/app/lib/phed/membership-template'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/cooperatives/:id/template
// Downloads a chairman-ready Excel template with two sheets:
//   • "New Members"                  — blank rows for the chairman to fill in Staff IDs
//   • "Staff Directory (Reference)"  — read-only staff list for looking up IDs
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const coop = await prisma.phedCooperative.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, name: true, isActive: true },
    })
    if (!coop)          return new NextResponse(JSON.stringify({ success: false, message: 'Cooperative not found' }), { status: 404 })
    if (!coop.isActive) return new NextResponse(JSON.stringify({ success: false, message: 'Cooperative is inactive' }), { status: 400 })

    const [company, staff] = await Promise.all([
      prisma.company.findUnique({ where: { id: coop.companyId }, select: { companyName: true } }),
      forCompany(coop.companyId).phedStaff.findMany({
        where:   { isActive: true },
        select:  { staffId: true, firstName: true, lastName: true, department: true, unit: true, category: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ])

    const buffer = await buildMembershipTemplate({
      entityType:  'Cooperative',
      entityName:  coop.name,
      companyName: company?.companyName ?? 'Your Company',
      staff,
    })

    const safeName = coop.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cooperative-members-template-${safeName}.xlsx"`,
        ...getCorsHeaders(origin),
      },
    })
  } catch (_e) { return new NextResponse(JSON.stringify({ error: 'Failed to generate template' }), { status: 500 }) }
}

