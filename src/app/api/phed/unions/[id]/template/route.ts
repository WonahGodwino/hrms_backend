import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { buildMembershipTemplate } from '@/app/lib/phed/membership-template'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/unions/:id/template
// Downloads a chairman-ready Excel template with two sheets:
//   • "New Members"           — blank rows for the chairman to fill in Staff IDs
//   • "Staff Directory (Reference)" — read-only staff list for looking up IDs
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    // Look up the union — use its companyId for all further queries
    const union = await (prisma as any).phedUnion.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, name: true, isActive: true },
    })
    if (!union)          return new NextResponse(JSON.stringify({ success: false, message: 'Union not found' }), { status: 404 })
    if (!union.isActive) return new NextResponse(JSON.stringify({ success: false, message: 'Union is inactive' }), { status: 400 })

    const [company, staff] = await Promise.all([
      prisma.company.findUnique({ where: { id: union.companyId }, select: { companyName: true } }),
      (prisma as any).phedStaff.findMany({
        where:   { companyId: union.companyId, isActive: true },
        select:  { staffId: true, firstName: true, lastName: true, department: true, unit: true, category: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ])

    const buffer = await buildMembershipTemplate({
      entityType:  'Union',
      entityName:  union.name,
      companyName: company?.companyName ?? 'Your Company',
      staff,
    })

    const safeName = union.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="union-members-template-${safeName}.xlsx"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return new NextResponse(JSON.stringify({ error: 'Failed to generate template' }), { status: 500 }) }
}

