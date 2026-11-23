// Moved out of app/api/leaves/upload/route.ts (CODE-004: keep route files small).
import ExcelJS from 'exceljs'
import { LEAVE_POLICY_COLUMNS, LEAVE_TYPE_COLUMNS, columnHeader, slugHeader, type ColumnSpec } from '@/app/lib/leave/upload-columns'
import { splitCsvLine } from '@/app/lib/staff/upload-parser'
import { XLSX_MIME, addInstructionsSheet, attachmentDisposition, buildSubtitle, generatedLabel, safeFileName, toneCell, writeStyledTable } from '@/app/lib/excel/sheet-theme'
import { NextResponse } from 'next/server'
import { withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'

export interface FailedRecord {
  sheetType: 'LEAVE_TYPES' | 'POLICIES'
  rowData: Record<string, unknown>
  error: string
  suggestion?: string
}

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    // ExcelJS cell values: rich text, hyperlinks ({ text }), formulas ({ result }) or dates
    const cell = value as { richText?: Array<{ text?: string } | null>; text?: unknown; result?: unknown }
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((t) => t?.text || '').join('').trim()
    }
    if (cell.text) {
      return String(cell.text).trim()
    }
    if (cell.result !== undefined) {
      return String(cell.result).trim()
    }
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]
    }
  }
  return String(value).trim()
}

export function parseSheetData(sheet: ExcelJS.Worksheet, specs: ColumnSpec[]): Array<Record<string, string>> {
  const data: Array<Record<string, string>> = []

  // slug -> key, accepting the friendly label and the raw key for each column.
  const slugToKey = new Map<string, string>()
  for (const c of specs) {
    slugToKey.set(slugHeader(c.label), c.key)
    slugToKey.set(slugHeader(c.key), c.key)
  }

  // Find the first row that maps enough cells to known columns.
  let headerRowNumber = -1
  let foundKeyByCol: string[] = []

  for (let rowNum = 1; rowNum <= Math.min(20, sheet.rowCount); rowNum++) {
    const row = sheet.getRow(rowNum)
    const keyByCol: string[] = []
    let foundCount = 0

    row.eachCell((cell, colNumber) => {
      const originalValue = cellToString(cell.value)
      if (originalValue && !originalValue.startsWith('📋') && !originalValue.includes('INSTRUCTIONS') && !originalValue.startsWith('•') && !originalValue.startsWith('#')) {
        const key = slugToKey.get(slugHeader(originalValue))
        if (key) {
          keyByCol[colNumber - 1] = key
          foundCount++
        }
      }
    })

    if (foundCount >= Math.min(3, specs.length) && foundCount >= specs.length / 2) {
      headerRowNumber = rowNum
      foundKeyByCol = keyByCol
      break
    }
  }

  if (headerRowNumber === -1) {
    throw new Error(`Could not find header row with required columns. Expected: ${specs.slice(0, 3).map((c) => c.label).join(', ')}...`)
  }

  // key -> column index
  const columnMapping: { [key: string]: number } = {}
  foundKeyByCol.forEach((key, index) => {
    if (key) columnMapping[key] = index
  })

  // Process data rows starting from the row after headers
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.getCell(1).isMerged) continue
    const rowData: Record<string, string> = {}
    let hasData = false
    let isInstructionRow = false
    
    for (const [expectedKey, colIndex] of Object.entries(columnMapping)) {
      const cell = row.getCell(colIndex + 1)
      let value = cellToString(cell.value)
      
      // Skip rows that are clearly instructions or metadata
      const lowerValue = value.toLowerCase()
      if (value && (lowerValue.includes('instruction') || 
          lowerValue.startsWith('📋') || 
          lowerValue.startsWith('#') ||
          lowerValue.startsWith('•') ||
          lowerValue.includes('delete sample') ||
          lowerValue.includes('required fields'))) {
        isInstructionRow = true
        break
      }
      
      // Handle Excel date numbers
      if (typeof cell.value === 'number' && cell.value > 40000 && cell.value < 100000) {
        if (cell.type === ExcelJS.ValueType.Date) {
          value = cell.value.toString()
        }
      }
      
      // Handle Date objects
      if (cell.value instanceof Date) {
        value = cell.value.toISOString().split('T')[0]
      }
      
      if (value && !isInstructionRow) {
        hasData = true
      }
      
      rowData[expectedKey] = value
    }
    
    // Only add rows that have actual data and aren't instruction rows
    if (hasData && !isInstructionRow) {
      // Check if this row has any meaningful data
      const hasValue = Object.values(rowData).some(v => v && v !== '')
      if (hasValue) {
        data.push(rowData)
      }
    }
  }
  
  return data
}

export async function parseCSVToWorkbook(csvText: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Data')
  
  const lines = csvText.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'))
  
  if (lines.length === 0) {
    throw new Error('Empty CSV file')
  }
  
  lines.forEach((line: string, rowIndex: number) => {
    const cells = splitCsvLine(line)
    const row = worksheet.addRow(cells)
    
    if (rowIndex === 0) {
      row.eachCell((cell) => {
        cell.font = { bold: true }
      })
    }
  })
  
  return workbook
}

export async function downloadTemplate(company: { companyName: string }, format: string, origin: string | null) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '24/7HR'
  const instructionSections: { heading: string; lines: string[] }[] = []

  // Header sits on row 4 under the title band; parseSheetData() scans the first
  // rows for it and skips merged note rows, so the banner never reaches the data.
  const addTemplateSheet = (
    name: string,
    title: string,
    specs: ColumnSpec[],
    rows: Record<string, string>[],
    instructions: string[]
  ) => {
    writeStyledTable(workbook.addWorksheet(name), {
      title,
      subtitle: buildSubtitle([company.companyName, 'Replace the sample rows with your data']),
      columns: specs.map((c) => ({ header: columnHeader(c), key: c.key, width: c.width, align: 'left' as const })),
      rows,
      autoFilter: false,
    })
    instructionSections.push({ heading: name, lines: instructions.map((l) => `• ${l}`) })
  }

  // ============ SHEET 1: Leave Types (FIRST - Most Important) ============
  addTemplateSheet(
    'Leave Types',
    'Leave Types Template',
    LEAVE_TYPE_COLUMNS,
    [
      { policyName: 'Annual Leave', typeName: 'Vacation Leave', code: 'VL', description: 'Regular vacation time off', isActive: 'YES' },
      { policyName: 'Sick Leave', typeName: 'Sick Leave', code: 'SL', description: 'Paid sick leave', isActive: 'YES' },
      { policyName: 'Unpaid Leave', typeName: 'Unpaid Leave', code: 'UL', description: 'Unpaid time off', isActive: 'YES' },
    ],
    [
      'Required fields are marked with *',
      'Policy Name must match exactly with a policy from the "Leave Policies" sheet',
      'Short Code: 2-4 uppercase alphanumeric characters (e.g., "VL", "SL", "ML")',
      'Active: "YES" or "NO" (defaults to YES if empty)',
      'A colour is assigned automatically — you do not set one here',
      'Approval for each leave type is set in the Leave Settings page, not this sheet',
      'Delete the sample rows (rows 5-7) before uploading your data',
      'Add your data starting from row 5',
    ]
  )

  // ============ SHEET 2: Leave Policies ============
  addTemplateSheet(
    'Leave Policies',
    'Leave Policies Template',
    LEAVE_POLICY_COLUMNS,
    [
      { policyName: 'Annual Leave', description: 'Paid time off for vacation', maxDays: '20', carryOver: '5', isPaid: 'YES', accrualRate: '1.67', minEmploymentMonths: '3', noticePeriod: '14', documentationRequired: 'NO', documentationTiming: 'At Application', allowHalfDays: 'YES', maxConsecutiveDays: '15', seasonalRestrictions: '12,1', requireManagerComments: 'YES' },
      { policyName: 'Sick Leave', description: 'Paid sick leave with doctor note', maxDays: '12', carryOver: '0', isPaid: 'YES', accrualRate: '1.0', minEmploymentMonths: '0', noticePeriod: '0', documentationRequired: 'YES', documentationTiming: 'After Leave', allowHalfDays: 'YES', maxConsecutiveDays: '5', seasonalRestrictions: '', requireManagerComments: 'NO' },
      { policyName: 'Unpaid Leave', description: 'Unpaid time off', maxDays: '30', carryOver: '0', isPaid: 'NO', accrualRate: '0', minEmploymentMonths: '6', noticePeriod: '30', documentationRequired: 'YES', documentationTiming: 'At Application', allowHalfDays: 'NO', maxConsecutiveDays: '30', seasonalRestrictions: '', requireManagerComments: 'YES' },
    ],
    [
      'Required fields are marked with *',
      'All leave requires approval — you set WHO approves each leave type in the Leave Settings page',
      'Yes/No fields (Paid Leave, Allow Half Days, etc.): Use "YES" or "NO"',
      'Documentation Timing: "At Application" (document needed to apply) or "After Leave" (apply now, submit the document later, e.g. a medical report). Only matters when Documentation Required is YES.',
      'Seasonal Restriction Months: Comma-separated months (1-12) e.g., "1,2,12" for Jan, Feb, Dec',
      'Delete the sample rows (rows 5-7) before uploading your data',
      'Add your data starting from row 5',
    ]
  )

  addInstructionsSheet(workbook, {
    title: 'Leave Template Instructions',
    subtitle: buildSubtitle([company.companyName, 'Read before filling the other sheets']),
    sections: instructionSections,
  })

  if (format === 'csv') {
    const csvRow = (values: (string | number)[]) => values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n'
    const csvHeader = (specs: ColumnSpec[]) => csvRow(specs.map(columnHeader))
    const csvSample = (specs: ColumnSpec[], row: Record<string, string>) => csvRow(specs.map((c) => row[c.key] ?? ''))

    let csvContent = '# LEAVE MANAGEMENT TEMPLATE\n'
    csvContent += `# Company: ${company.companyName}\n`
    csvContent += `# Generated: ${new Date().toISOString()}\n`
    csvContent += '# Instructions: Lines starting with # are comments\n'
    csvContent += '# Delete the sample rows and add your data below\n\n'

    // Leave Types sheet (FIRST)
    csvContent += '## LEAVE TYPES ##\n'
    csvContent += csvHeader(LEAVE_TYPE_COLUMNS)
    csvContent += csvSample(LEAVE_TYPE_COLUMNS, { policyName: 'Annual Leave', typeName: 'Vacation Leave', code: 'VL', description: 'Regular vacation time off', isActive: 'YES' })
    csvContent += csvSample(LEAVE_TYPE_COLUMNS, { policyName: 'Sick Leave', typeName: 'Sick Leave', code: 'SL', description: 'Paid sick leave', isActive: 'YES' })
    csvContent += csvSample(LEAVE_TYPE_COLUMNS, { policyName: 'Unpaid Leave', typeName: 'Unpaid Leave', code: 'UL', description: 'Unpaid time off', isActive: 'YES' })
    csvContent += '\n'

    // Leave Policies sheet
    csvContent += '## LEAVE POLICIES ##\n'
    csvContent += csvHeader(LEAVE_POLICY_COLUMNS)
    csvContent += csvSample(LEAVE_POLICY_COLUMNS, { policyName: 'Annual Leave', description: 'Paid time off for vacation', maxDays: '20', carryOver: '5', isPaid: 'YES', accrualRate: '1.67', minEmploymentMonths: '3', noticePeriod: '14', documentationRequired: 'NO', documentationTiming: 'At Application', allowHalfDays: 'YES', maxConsecutiveDays: '15', seasonalRestrictions: '12,1', requireManagerComments: 'YES' })
    csvContent += csvSample(LEAVE_POLICY_COLUMNS, { policyName: 'Sick Leave', description: 'Paid sick leave with doctor note', maxDays: '12', carryOver: '0', isPaid: 'YES', accrualRate: '1.0', minEmploymentMonths: '0', noticePeriod: '0', documentationRequired: 'YES', documentationTiming: 'After Leave', allowHalfDays: 'YES', maxConsecutiveDays: '5', seasonalRestrictions: '', requireManagerComments: 'NO' })
    csvContent += csvSample(LEAVE_POLICY_COLUMNS, { policyName: 'Unpaid Leave', description: 'Unpaid time off', maxDays: '30', carryOver: '0', isPaid: 'NO', accrualRate: '0', minEmploymentMonths: '6', noticePeriod: '30', documentationRequired: 'YES', documentationTiming: 'At Application', allowHalfDays: 'NO', maxConsecutiveDays: '30', seasonalRestrictions: '', requireManagerComments: 'YES' })

    const response = new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(`Leave Template (${safeFileName(company.companyName)}).csv`),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
    return withCors(response, origin)
  } else {
    const buffer = await workbook.xlsx.writeBuffer()

    const response = new NextResponse(buffer, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': attachmentDisposition(`Leave Template (${safeFileName(company.companyName)}).xlsx`),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
    return withCors(response, origin)
  }
}

export async function downloadFailedRecords(
  upload: { id: string; companyId: string; createdAt: Date }, 
  failedRecords: FailedRecord[], 
  format: string, 
  origin: string | null
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '24/7HR'

  const uploadCompany = await prisma.company.findUnique({ where: { id: upload.companyId }, select: { companyName: true } })
  const failedLabel = safeFileName(uploadCompany?.companyName || 'Company')

  const leaveTypesRecords = failedRecords.filter((r: FailedRecord) => r.sheetType === 'LEAVE_TYPES')
  const policiesRecords = failedRecords.filter((r: FailedRecord) => r.sheetType === 'POLICIES')

  const uploadDate = new Date(upload.createdAt)
  const addFailedSheet = (
    name: string,
    title: string,
    cols: { header: string; key: string; width: number }[],
    records: FailedRecord[],
    withSuggestion = false
  ) => {
    const columns = [
      ...cols.map((c) => ({ ...c, align: 'left' as const })),
      { header: 'ERROR', key: 'error', width: 50, align: 'left' as const },
      ...(withSuggestion ? [{ header: 'SUGGESTION', key: 'suggestion', width: 50, align: 'left' as const }] : []),
    ]
    const errorCol = cols.length + 1
    writeStyledTable(workbook.addWorksheet(name), {
      title,
      subtitle: buildSubtitle([`Upload ${upload.id}`, `Uploaded ${generatedLabel(uploadDate)}`, 'Correct the errors and re-upload']),
      columns,
      rows: records.map((record) => ({ ...record.rowData, error: record.error, suggestion: record.suggestion || '' })),
      onRow: (row) => toneCell(row.getCell(errorCol), 'danger'),
    })
  }

  const failedCols = (specs: ColumnSpec[]) => specs.map((c) => ({ header: columnHeader(c), key: c.key, width: c.width }))

  // Leave Types failed sheet (FIRST)
  if (leaveTypesRecords.length > 0) {
    addFailedSheet('Failed Leave Types', 'Failed Leave Types', failedCols(LEAVE_TYPE_COLUMNS), leaveTypesRecords)
  }

  if (policiesRecords.length > 0) {
    addFailedSheet('Failed Policies', 'Failed Leave Policies', failedCols(LEAVE_POLICY_COLUMNS), policiesRecords, true)
  }

  if (format === 'csv') {
    let csvContent = '# FAILED RECORDS REPORT\n'
    csvContent += `# Upload ID: ${upload.id}\n`
    csvContent += `# Upload Date: ${new Date(upload.createdAt).toISOString()}\n`
    csvContent += '# Please correct the errors and re-upload\n\n'
    
    const csvField = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csvFailed = (heading: string, specs: ColumnSpec[], records: FailedRecord[], withSuggestion = false) => {
      csvContent += `## ${heading} ##\n`
      csvContent += [...specs.map(columnHeader), 'ERROR', ...(withSuggestion ? ['SUGGESTION'] : [])].map(csvField).join(',') + '\n'
      records.forEach((record: FailedRecord) => {
        csvContent += [
          ...specs.map((c) => record.rowData[c.key]),
          record.error,
          ...(withSuggestion ? [record.suggestion || ''] : []),
        ].map(csvField).join(',') + '\n'
      })
      csvContent += '\n'
    }

    if (leaveTypesRecords.length > 0) csvFailed('FAILED LEAVE TYPES', LEAVE_TYPE_COLUMNS, leaveTypesRecords)
    if (policiesRecords.length > 0) csvFailed('FAILED POLICIES', LEAVE_POLICY_COLUMNS, policiesRecords, true)

    const response = new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(`Failed Leave Records (${failedLabel}).csv`),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
    return withCors(response, origin)
  } else {
    const buffer = await workbook.xlsx.writeBuffer()
    const response = new NextResponse(buffer, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': attachmentDisposition(`Failed Leave Records (${failedLabel}).xlsx`),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
    return withCors(response, origin)
  }
}
