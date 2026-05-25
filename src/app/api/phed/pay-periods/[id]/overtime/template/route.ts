import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/overtime/template
// Downloads a pre-populated Excel template with all active staff listed so HR
// only needs to fill in the overtime hours column.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { companyId: true, periodName: true },
    })
    if (!period) {
      return new NextResponse(JSON.stringify({ error: 'Pay period not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Load all active staff for pre-population
    const staff = await (prisma as any).phedStaff.findMany({
      where: { companyId: period.companyId, isActive: true },
      select: { staffId: true, firstName: true, lastName: true, department: true, category: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const workbook = new ExcelJS.Workbook()
    const ws       = workbook.addWorksheet('Overtime Upload')

    ws.columns = [
      { header: 'Staff ID *',      key: 'staffId',       width: 18 },
      { header: 'Full Name',       key: 'fullName',       width: 26 },
      { header: 'Department',      key: 'department',     width: 22 },
      { header: 'Category',        key: 'category',       width: 14 },
      { header: 'Overtime Hours *',key: 'overtimeHours',  width: 18 },
    ]

    // Style header
    const headerRow = ws.getRow(1)
    headerRow.eachCell(cell => {
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    headerRow.height = 24

    // Add instructions as cell comments on headers (not a notes row, which confuses the parser)
    ws.getCell('A1').note = 'Do not edit — Staff ID from the system'
    ws.getCell('B1').note = 'Auto-filled — do not edit'
    ws.getCell('C1').note = 'Auto-filled — do not edit'
    ws.getCell('D1').note = 'Auto-filled — do not edit'
    ws.getCell('E1').note = 'Enter overtime hours — decimals allowed (e.g. 8.5)'

    // Data rows start at row 2 (directly after the single header row)
    staff.forEach((s: any, i: number) => {
      const row = ws.getRow(i + 2)
      row.getCell(1).value = s.staffId
      row.getCell(2).value = `${s.firstName} ${s.lastName}`
      row.getCell(3).value = s.department ?? ''
      row.getCell(4).value = s.category
      row.getCell(5).value = 0   // HR fills this in

      // Lock cols 1–4, only col 5 editable (styling cue)
      for (let c = 1; c <= 4; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fafb' } }
        row.getCell(c).font = { color: { argb: 'FF374151' }, size: 9 }
      }
      row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
      row.getCell(5).font = { bold: true, size: 10 }
      row.getCell(5).numFmt = '0.00'
    })

    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const buffer = await workbook.xlsx.writeBuffer()
    const safeName = period.periodName.replace(/\s+/g, '-')

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="overtime-${safeName}.xlsx"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return new NextResponse(JSON.stringify({ error: 'Failed to generate template' }), { status: 500 }) }
}

