// ============================================================
// Run report (.xlsx) for letter runs — lists every row with its
// outcome, file name and findings (FR-06 / FR-13).
// ============================================================

import ExcelJS from 'exceljs'

export async function buildRunReportXlsx(run: any, rows: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Run Report')

  ws.addRow([`Run ${run.id}`, run.status, `Template v${run.templateVersion ?? '-'}`])
  ws.addRow([])
  ws.addRow(['Excel Row', 'Employee ID', 'Status', 'Warnings / Errors', 'File'])

  for (const row of rows) {
    const msgs = (Array.isArray(row.findings) ? row.findings : [])
      .map((f: any) => `${f.severity} ${f.code}: ${f.message}`)
      .join(' | ')
    const file = row.outputKey ? row.outputKey.split('/').pop() : ''
    ws.addRow([row.excelRow, row.employeeId, row.status, msgs, file])
  }

  ws.getRow(1).font = { bold: true }
  ws.getRow(3).font = { bold: true }
  ws.columns.forEach((c, i) => {
    c.width = [12, 20, 18, 80, 40][i] ?? 18
  })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as any)
}
