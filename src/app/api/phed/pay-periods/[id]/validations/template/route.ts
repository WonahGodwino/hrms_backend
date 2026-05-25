import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/validations/template
// Downloads a pre-populated Excel template with all staff listed and their current
// validation status so supervisors/HR can update the Status column and re-upload.
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

    // Load validations with staff details (or all active staff if validation not yet opened)
    const validations = await (prisma as any).phedValidation.findMany({
      where: { payPeriodId: params.id },
      include: {
        staff: {
          select: { staffId: true, firstName: true, lastName: true, department: true, category: true },
        },
      },
      orderBy: { staff: { lastName: 'asc' } },
    })

    const workbook = new ExcelJS.Workbook()
    const ws       = workbook.addWorksheet('Validation Upload')

    ws.columns = [
      { header: 'Staff ID *',   key: 'staffId',     width: 18 },
      { header: 'Full Name',    key: 'fullName',     width: 26 },
      { header: 'Department',   key: 'department',   width: 22 },
      { header: 'Category',     key: 'category',     width: 14 },
      { header: 'Status *',     key: 'status',       width: 20 },
      { header: 'Reason',       key: 'reason',       width: 36 },
    ]

    // Header styling
    const headerRow = ws.getRow(1)
    headerRow.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    headerRow.height = 24

    // Add header cell notes as comments instead of a notes row
    ws.getCell('A1').note = 'Do not edit — Staff ID from the system'
    ws.getCell('B1').note = 'Do not edit'
    ws.getCell('C1').note = 'Do not edit'
    ws.getCell('D1').note = 'Do not edit'
    ws.getCell('E1').note = 'Enter YES or NO'
    ws.getCell('F1').note = 'Optional — required only when Status is NO'

    // Data rows start at row 2 (directly after the single header row)
    validations.forEach((v: any, i: number) => {
      const row    = ws.getRow(i + 2)
      const status = v.status === 'YES_FOR_PAYMENT' ? 'YES'
                   : v.status === 'NO_FOR_PAYMENT'  ? 'NO'
                   : 'PENDING'

      row.getCell(1).value = v.staff.staffId
      row.getCell(2).value = `${v.staff.firstName} ${v.staff.lastName}`
      row.getCell(3).value = v.staff.department ?? ''
      row.getCell(4).value = v.staff.category
      row.getCell(5).value = status
      row.getCell(6).value = v.reason ?? ''

      // Lock cols 1–4
      for (let c = 1; c <= 4; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fafb' } }
        row.getCell(c).font = { color: { argb: 'FF374151' }, size: 9 }
      }

      // Editable status cell with dropdown
      const statusCell = row.getCell(5)
      statusCell.fill  = { type: 'pattern', pattern: 'solid',
        fgColor: { argb: status === 'YES' ? 'FFe6f4ea' : status === 'NO' ? 'FFfce8e6' : 'FFfffde7' } }
      statusCell.font  = { bold: true, size: 10,
        color: { argb: status === 'YES' ? 'FF1e7e34' : status === 'NO' ? 'FFb71c1c' : 'FF795548' } }
      statusCell.dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"YES,NO"'],
        showErrorMessage: true,
        errorTitle: 'Invalid Status',
        error: 'Please enter YES or NO',
      }

      row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
    })

    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const buffer   = await workbook.xlsx.writeBuffer()
    const safeName = period.periodName.replace(/\s+/g, '-')

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="validation-${safeName}.xlsx"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'Failed to generate template' }), { status: 500 })
  }
}

