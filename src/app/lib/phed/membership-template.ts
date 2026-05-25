// ============================================================
// PHED Module – Membership Upload Template Generator
// Shared by /unions/:id/template and /cooperatives/:id/template
// ============================================================

import ExcelJS from 'exceljs'

export interface MembershipTemplateOptions {
  entityType:  'Union' | 'Cooperative' | 'DeductionLiability'
  entityName:  string
  companyName: string
  staff: Array<{
    staffId:    string
    firstName:  string
    lastName:   string
    department: string | null
    unit:       string | null
    category:   string
  }>
}

export async function buildMembershipTemplate(opts: MembershipTemplateOptions): Promise<Buffer> {
  const { entityType, entityName, companyName, staff } = opts
  const isCooperative      = entityType === 'Cooperative'
  const isDeductionLiab    = entityType === 'DeductionLiability'
  const displayType        = isDeductionLiab ? 'Deduction/Liability' : entityType

  const wb = new ExcelJS.Workbook()
  wb.creator = '24/7HR – PHED Module'

  // ── Sheet 1: New Members (what the chairman fills in) ────────
  const ws1 = wb.addWorksheet('New Members')

  const totalCols = isCooperative ? 5 : isDeductionLiab ? 3 : 4
  const colRange  = isCooperative ? 'A1:E1' : isDeductionLiab ? 'A1:C1' : 'A1:D1'

  // Title block
  ws1.mergeCells(colRange)
  const titleCell      = ws1.getCell('A1')
  titleCell.value      = `${displayType} Upload — ${entityName}`
  titleCell.font       = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  titleCell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
  titleCell.alignment  = { horizontal: 'center', vertical: 'middle' }
  ws1.getRow(1).height = 32

  ws1.mergeCells(isCooperative ? 'A2:E2' : isDeductionLiab ? 'A2:C2' : 'A2:D2')
  const companyCell    = ws1.getCell('A2')
  companyCell.value    = companyName
  companyCell.font     = { italic: true, size: 10, color: { argb: 'FF1a3a5c' } }
  companyCell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8f0fe' } }
  companyCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws1.getRow(2).height = 20

  ws1.mergeCells(isCooperative ? 'A3:E3' : isDeductionLiab ? 'A3:C3' : 'A3:D3')
  const instrCell      = ws1.getCell('A3')
  instrCell.value      = isCooperative
    ? 'Instructions: Enter the Staff ID in Column A and the staff Full Name in Column B, then the Contribution Amount and Loan Amount. ' +
      'The Total Amount (Column E) is calculated automatically. ' +
      'Do NOT edit the Total Amount column directly. Staff IDs must match exactly as issued by HR.'
    : isDeductionLiab
    ? 'Instructions: Enter the Staff ID in Column A, Full Name in Column B (reference only), and the fixed deduction Amount in Column C. ' +
      'Staff IDs must match exactly as issued by HR.'
    : 'Instructions: Enter the Staff ID of each new member in Column A. ' +
      'Full Name is optional — for your own reference only. ' +
      'Do NOT change the column headers. Staff IDs must match exactly as issued by HR.'
  instrCell.font       = { size: 9, italic: true, color: { argb: 'FF374151' } }
  instrCell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
  instrCell.alignment  = { wrapText: true, vertical: 'middle' }
  ws1.getRow(3).height = 38

  // Column definitions
  if (isCooperative) {
    ws1.columns = [
      { key: 'staffId',            width: 20 },
      { key: 'fullName',           width: 28 },
      { key: 'contributionAmount', width: 22 },
      { key: 'loanAmount',         width: 22 },
      { key: 'totalAmount',        width: 22 },
    ]

    const headerRow  = ws1.getRow(4)
    headerRow.values = ['Staff ID *', 'Full Name', 'Contribution Amount (₦)', 'Loan Amount (₦)', 'Total Amount (₦)']
    headerRow.eachCell((cell, colNum) => {
      const isRequired = colNum === 1
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isRequired ? 'FF1a3a5c' : 'FF2d5080' } }
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FF1a3a5c' } } }
    })
    ws1.getRow(4).height = 24

    // 50 data rows with formula in Total Amount column
    for (let i = 5; i <= 54; i++) {
      const row = ws1.getRow(i)

      // Staff ID — required (highlighted yellow)
      row.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
      row.getCell(1).font      = { bold: true, size: 10 }
      row.getCell(1).alignment = { horizontal: 'center' }

      // Full Name — plain white
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } }

      // Contribution Amount — plain white, number format
      row.getCell(3).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } }
      row.getCell(3).numFmt = '#,##0.00'

      // Loan Amount — plain white, number format
      row.getCell(4).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } }
      row.getCell(4).numFmt = '#,##0.00'

      // Total Amount — formula cell (light blue, read-only intent)
      const totalCell = row.getCell(5)
      totalCell.value  = { formula: `C${i}+D${i}`, result: 0 } as any
      totalCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8f0fe' } }
      totalCell.font   = { bold: true, size: 10, color: { argb: 'FF1a3a5c' } }
      totalCell.numFmt = '#,##0.00'
      totalCell.alignment = { horizontal: 'right' }

      // Borders
      for (let c = 1; c <= 5; c++) {
        row.getCell(c).border = { bottom: { style: 'hair', color: { argb: 'FFd1d5db' } } }
      }
      row.height = 18
    }
  } else if (isDeductionLiab) {
    // Deduction/Liability template: Staff ID *, Full Name (ref), Amount *
    ws1.columns = [
      { key: 'staffId',  width: 20 },
      { key: 'fullName', width: 28 },
      { key: 'amount',   width: 22 },
    ]

    const headerRow  = ws1.getRow(4)
    headerRow.values = ['Staff ID *', 'Full Name', 'Amount (₦) *']
    headerRow.eachCell((cell, colNum) => {
      const isRequired = colNum !== 2
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isRequired ? 'FF1a3a5c' : 'FF2d5080' } }
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FF1a3a5c' } } }
    })
    ws1.getRow(4).height = 24

    for (let i = 5; i <= 54; i++) {
      const row = ws1.getRow(i)
      row.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
      row.getCell(1).font      = { bold: true, size: 10 }
      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } }
      row.getCell(3).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
      row.getCell(3).numFmt = '#,##0.00'
      for (let c = 1; c <= 3; c++) {
        row.getCell(c).border = { bottom: { style: 'hair', color: { argb: 'FFd1d5db' } } }
      }
      row.height = 18
    }
  } else {
    // Union template: Staff ID, Full Name, Department, Unit
    ws1.columns = [
      { key: 'staffId',    width: 20 },
      { key: 'fullName',   width: 28 },
      { key: 'department', width: 24 },
      { key: 'unit',       width: 20 },
    ]

    const headerRow  = ws1.getRow(4)
    headerRow.values = ['Staff ID *', 'Full Name', 'Department', 'Unit']
    headerRow.eachCell((cell, colNum) => {
      const isRequired = colNum === 1
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isRequired ? 'FF1a3a5c' : 'FF2d5080' } }
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FF1a3a5c' } } }
    })
    ws1.getRow(4).height = 24

    for (let i = 5; i <= 54; i++) {
      const row = ws1.getRow(i)
      row.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfffde7' } }
      row.getCell(1).font      = { bold: true, size: 10 }
      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } }
      row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } }
      row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFffffff' } }
      for (let c = 1; c <= 4; c++) {
        row.getCell(c).border = { bottom: { style: 'hair', color: { argb: 'FFd1d5db' } } }
      }
      row.height = 18
    }
  }

  ws1.views = [{ state: 'frozen', xSplit: isCooperative ? 2 : 1, ySplit: 4 }]
  // totalCols used for sheet 2 merge ranges below (already set above)

  // ── Sheet 2: Staff Directory (read-only reference) ───────────
  const ws2 = wb.addWorksheet('Staff Directory (Reference)')

  ws2.mergeCells('A1:E1')
  const dirTitle      = ws2.getCell('A1')
  dirTitle.value      = `Staff Directory — ${companyName} (Use this to look up Staff IDs)`
  dirTitle.font       = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
  dirTitle.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3a5c' } }
  dirTitle.alignment  = { horizontal: 'center', vertical: 'middle' }
  ws2.getRow(1).height = 28

  ws2.mergeCells('A2:E2')
  const dirNote       = ws2.getCell('A2')
  dirNote.value       = 'This sheet is for reference only. Do not edit or upload this sheet.'
  dirNote.font        = { italic: true, size: 9, color: { argb: 'FF6b7280' } }
  dirNote.fill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fafb' } }
  dirNote.alignment   = { horizontal: 'center' }
  ws2.getRow(2).height = 18

  ws2.columns = [
    { key: 'sn',         width: 6  },
    { key: 'staffId',    width: 20 },
    { key: 'fullName',   width: 30 },
    { key: 'department', width: 24 },
    { key: 'unit',       width: 20 },
  ]

  const dirHeader = ws2.getRow(3)
  dirHeader.values = ['S/N', 'Staff ID', 'Full Name', 'Department', 'Unit']
  dirHeader.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2d5080' } }
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  ws2.getRow(3).height = 22

  staff.forEach((s, idx) => {
    const row  = ws2.getRow(idx + 4)
    const even = idx % 2 === 0
    const bg   = even ? 'FFf9fafb' : 'FFffffff'
    row.values = [
      idx + 1,
      s.staffId,
      `${s.firstName} ${s.lastName}`,
      s.department ?? '',
      s.unit       ?? '',
    ]
    row.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.font      = { size: 9 }
      cell.alignment = { vertical: 'middle' }
    })
    row.getCell(1).alignment = { horizontal: 'center' }
    row.getCell(2).font      = { bold: true, size: 9, color: { argb: 'FF1a3a5c' } }
    row.height = 16
  })

  ws2.views = [{ state: 'frozen', ySplit: 3 }]

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
