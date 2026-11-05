// src/app/api/leaves/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { writeStyledTable, buildSubtitle, generatedLabel, toneCell, safeFileName, attachmentDisposition, XLSX_MIME, addInstructionsSheet } from '@/app/lib/excel/sheet-theme'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { randomUUID } from 'crypto'

// Define types for failed records
interface FailedRecord {
  sheetType: 'LEAVE_TYPES' | 'POLICIES'
  rowData: any
  error: string
  suggestion?: string
}

interface ProcessResults {
  leaveTypes: {
    created: number
    updated: number
    failed: number
    errors: string[]
    failedRecords: FailedRecord[]
  }
  policies: {
    created: number
    updated: number
    failed: number
    errors: string[]
    failedRecords: FailedRecord[]
  }
}

// Helper functions
function cellToString(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if (Array.isArray(value?.richText)) {
      return value.richText.map((t: any) => t?.text || '').join('').trim()
    }
    if (value?.text) {
      return String(value.text).trim()
    }
    if (value?.result !== undefined) {
      return String(value.result).trim()
    }
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]
    }
  }
  return String(value).trim()
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"' && line[i + 1] === '"') {
      current += '"'
      i++
      continue
    }
    
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    
    if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }
    
    current += char
  }
  
  result.push(current.trim())
  return result
}

// Case/space/punctuation-insensitive key for a header or label, so a sheet's
// human-readable header ("Maximum Days Per Year") and the machine key
// ("maxDays") can both resolve to the same column. "*" (required marker) is
// ignored. This is what lets the template show friendly headers while the
// importer still recognises them \u2014 and keeps older key-headed sheets working.
function slugHeader(text: unknown): string {
  return String(text ?? '')
    .replace(/\u00A0/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Column definition shared by the template writer and the importer: `label`
// is the human header shown in the sheet, `key` is what the code reads. A
// header cell matches a column when its slug equals the label's OR the key's,
// so both the friendly header and the raw key are accepted.
type ColumnSpec = { key: string; label: string; required?: boolean; width: number }

// Leave Types sheet \u2014 no `color` (auto-assigned by the system) and no
// approval columns (approval is set per leave type in the Leave Settings UI).
const LEAVE_TYPE_COLUMNS: ColumnSpec[] = [
  { key: 'policyName', label: 'Policy Name', required: true, width: 24 },
  { key: 'typeName', label: 'Leave Type Name', required: true, width: 24 },
  { key: 'code', label: 'Short Code', required: true, width: 12 },
  { key: 'description', label: 'Description', width: 34 },
  { key: 'isActive', label: 'Active', width: 12 },
]

// Leave Policies sheet \u2014 no `requiresApproval` (all leave needs approval) and
// no `approvalWorkflow` (set per leave type in the UI, not the sheet).
const LEAVE_POLICY_COLUMNS: ColumnSpec[] = [
  { key: 'policyName', label: 'Policy Name', required: true, width: 24 },
  { key: 'description', label: 'Description', width: 34 },
  { key: 'maxDays', label: 'Maximum Days Per Year', required: true, width: 20 },
  { key: 'carryOver', label: 'Carry-Over Days', width: 16 },
  { key: 'isPaid', label: 'Paid Leave', width: 12 },
  { key: 'accrualRate', label: 'Monthly Accrual Rate', width: 18 },
  { key: 'minEmploymentMonths', label: 'Minimum Employment (Months)', width: 24 },
  { key: 'noticePeriod', label: 'Notice Period (Days)', width: 18 },
  { key: 'documentationRequired', label: 'Documentation Required', width: 22 },
  { key: 'documentationTiming', label: 'Documentation Timing', width: 22 },
  { key: 'allowHalfDays', label: 'Allow Half Days', width: 16 },
  { key: 'maxConsecutiveDays', label: 'Maximum Consecutive Days', width: 22 },
  { key: 'seasonalRestrictions', label: 'Seasonal Restriction Months', width: 24 },
  { key: 'requireManagerComments', label: 'Require Manager Comments', width: 24 },
]

// System-assigned leave-type colours \u2014 HR shouldn't have to pick hex codes, so
// one is chosen deterministically from the type's code (stable across re-imports).
const LEAVE_TYPE_PALETTE = ['#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#0EA5E9', '#D946EF']
function autoLeaveTypeColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return LEAVE_TYPE_PALETTE[hash % LEAVE_TYPE_PALETTE.length]
}

// A 2-4 char uppercase code from a policy/type name: initials of the words,
// e.g. "Annual Leave" -> "AL", "Sick Leave" -> "SL". Falls back to the first
// letters when a single short word can't make two initials.
function deriveLeaveCode(name: string): string {
  const words = name.replace(/[^A-Za-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  let code = words.map((w) => w[0]).join('').toUpperCase()
  if (code.length < 2) code = (name.replace(/[^A-Za-z0-9]/g, '').toUpperCase() + 'XX').slice(0, 2)
  return code.slice(0, 4)
}

// Give every policy at least one selectable leave type. A policy with no type
// doesn't appear in the apply dropdown, so one named after the policy is
// created automatically — the Leave Types sheet is only needed when a policy
// should offer MORE than one type. Returns how many were created.
async function ensureDefaultLeaveTypes(
  db: { leavePolicy: any; leaveType: any },
  companyId: string
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = []
  let created = 0
  const policies = await db.leavePolicy.findMany({
    where: { companyId },
    select: { id: true, name: true, leaveTypes: { select: { id: true } } },
  })
  for (const p of policies) {
    if (p.leaveTypes.length > 0) continue
    const code = deriveLeaveCode(p.name)
    try {
      await db.leaveType.create({
        data: { policyId: p.id, name: p.name, code, description: '', color: autoLeaveTypeColor(code), isActive: true },
      })
      created++
    } catch (e: any) {
      errors.push(`Auto leave type for "${p.name}": ${e?.message || e}`)
    }
  }
  return { created, errors }
}

// Header shown in the sheet: friendly label, with " *" appended when required.
const columnHeader = (c: ColumnSpec) => `${c.label}${c.required ? ' *' : ''}`

// "After Leave" / "AFTER_LEAVE" / "Later" → AFTER_LEAVE (apply now, submit the
// document later). Anything else (incl. empty) → AT_APPLICATION (the default:
// document must be provided when applying).
function normalizeDocTiming(v: unknown): 'AT_APPLICATION' | 'AFTER_LEAVE' {
  const s = slugHeader(v)
  if (['afterleave', 'after', 'later', 'defer', 'deferred'].includes(s)) return 'AFTER_LEAVE'
  return 'AT_APPLICATION'
}

function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
}

async function ensureUploadDirectories() {
  const uploadsDir = path.join(process.cwd(), 'uploads')
  const leavesDir = path.join(uploadsDir, 'leaves')
  await mkdir(leavesDir, { recursive: true })
  return { uploadsDir, leavesDir }
}

// Finds the header row (the template has a title banner above it) and reads
// each column into its machine key. Columns are matched by slug against BOTH
// the human label and the raw key, so the friendly headers in the template and
// any older key-headed sheet both resolve correctly.
function parseSheetData(sheet: ExcelJS.Worksheet, specs: ColumnSpec[]): any[] {
  const data: any[] = []

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
    const rowData: any = {}
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
        const date = ExcelJS.ValueType.Date;
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

// Manual CSV parsing function
async function parseCSVToWorkbook(csvText: string): Promise<ExcelJS.Workbook> {
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

// Generate error suggestions
function getPolicyErrorSuggestion(error: string, policyData: any): string {
  if (error.includes('Maximum Days') || error.includes('maxDays')) {
    return 'Enter a positive number (e.g., 30)'
  }
  if (error.includes('seasonalRestrictions')) {
    return 'Use comma-separated months 1-12 (e.g., "1,2,12" for Jan, Feb, Dec)'
  }
  if (error.includes('Boolean')) {
    return 'Use "YES" or "NO" for boolean fields'
  }
  return 'Check the format and required fields'
}

// Clean template download function with LEAVE TYPES first
async function downloadTemplate(company: any, format: string, origin: string | null) {
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

// Process leave upload data
async function processLeaveUpload(companyId: string, file: File, userId: string, fileName: string, filePath: string): Promise<{
  upload: any
  results: ProcessResults
  hasFailedRecords: boolean
  totalFailed: number
}> {
  // Create initial upload record
  const leaveUpload = await prisma.leave_uploads.create({
    data: {
      id: randomUUID(),
      companyId: companyId,
      fileName: fileName,
      filePath: filePath,
      uploadedBy: userId,
      policiesCreated: 0,
      policiesFailed: 0,
      policiesUpdated: 0,
      leaveTypesCreated: 0,
      leaveTypesFailed: 0,
      leaveTypesUpdated: 0,
      holidaysCreated: 0,
      holidaysFailed: 0,
      holidaysUpdated: 0,
      blackoutPeriodsCreated: 0,
      blackoutPeriodsFailed: 0,
      blackoutPeriodsUpdated: 0,
      createdAt: new Date(),
      failedRecords: Prisma.DbNull
    }
  })

  const results: ProcessResults = {
    leaveTypes: { created: 0, updated: 0, failed: 0, errors: [], failedRecords: [] },
    policies: { created: 0, updated: 0, failed: 0, errors: [], failedRecords: [] }
  }

  let workbook: ExcelJS.Workbook | null = null
  
  try {
    const bytes = await file.arrayBuffer()
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || ''
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    
    if (isCsv) {
      const csvText = new TextDecoder().decode(bytes)
      workbook = await parseCSVToWorkbook(csvText)
    } else {
      workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(bytes)
    }
    
    if (!workbook) {
      throw new Error('Failed to parse file')
    }

    // ============ PROCESS LEAVE TYPES (FIRST) ============
    try {
      const typesSheet = workbook.getWorksheet('Leave Types')
      if (!typesSheet) {
        results.leaveTypes.errors.push('Missing "Leave Types" worksheet')
      } else {
        const typesData = parseSheetData(typesSheet, LEAVE_TYPE_COLUMNS)

        // Get all existing policies first for mapping
        const policies = await prisma.leavePolicy.findMany({ where: { companyId: companyId } })
        const policyMap = new Map(policies.map((p: any) => [p.name, p.id]))

        for (let i = 0; i < typesData.length; i++) {
          const rowNumber = i + 2
          const typeData = typesData[i]
          
          try {
            // Handle both camelCase and any case variations
            const policyName = typeData.policyName || typeData.policyname
            const typeName = typeData.typeName || typeData.typename
            const code = typeData.code
            const description = typeData.description || ''
            const isActiveValue = typeData.isActive || typeData.isactive

            if (!policyName || !typeName || !code) {
              throw new Error(`Missing required fields. Policy: "${policyName}", Type: "${typeName}", Code: "${code}"`)
            }

            const policyId = policyMap.get(policyName)
            if (!policyId) {
              const availablePolicies = Array.from(policyMap.keys()).join(', ')
              throw new Error(`Policy "${policyName}" not found. Available policies: ${availablePolicies || 'None. Please create policies first.'}`)
            }

            // Validate code format (2-4 alphanumeric characters)
            const codeRegex = /^[A-Z0-9]{2,4}$/i
            if (!codeRegex.test(code)) {
              throw new Error(`Code "${code}" must be 2-4 alphanumeric characters (e.g., "VL", "SL")`)
            }

            const isActive = isActiveValue?.toUpperCase() !== 'NO'

            // Check if leave type exists
            const existingType = await prisma.leaveType.findFirst({
              where: {
                policyId: policyId,
                OR: [
                  { name: typeName },
                  { code: code.toUpperCase() }
                ]
              }
            })

            // Colour is system-assigned (HR doesn't pick hex codes): keep an
            // existing type's colour, otherwise derive one deterministically.
            const color = existingType?.color || autoLeaveTypeColor(code.toUpperCase())

            const typeDataToSave = {
              policyId: policyId,
              name: typeName,
              code: code.toUpperCase(),
              description: description,
              color: color,
              isActive: isActive
            }

            if (existingType) {
              await prisma.leaveType.update({
                where: { id: existingType.id },
                data: typeDataToSave
              })
              results.leaveTypes.updated++
            } else {
              await prisma.leaveType.create({ data: typeDataToSave })
              results.leaveTypes.created++
            }

          } catch (error: any) {
            results.leaveTypes.failed++
            results.leaveTypes.errors.push(`Row ${rowNumber}: ${error.message}`)
            results.leaveTypes.failedRecords.push({
              sheetType: 'LEAVE_TYPES',
              rowData: typeData,
              error: error.message
            })
          }
        }
      }
    } catch (error: any) {
      results.leaveTypes.errors.push(`Error processing leave types sheet: ${error.message}`)
    }

    // ============ PROCESS LEAVE POLICIES ============
    try {
      const policiesSheet = workbook.getWorksheet('Leave Policies')
      if (!policiesSheet) {
        results.policies.errors.push('Missing "Leave Policies" worksheet')
      } else {
        const policiesData = parseSheetData(policiesSheet, LEAVE_POLICY_COLUMNS)

        for (let i = 0; i < policiesData.length; i++) {
          const rowNumber = i + 2
          const policyData = policiesData[i]

          try {
            // Handle case variations
            const policyName = policyData.policyName || policyData.policyname
            const maxDaysValue = policyData.maxDays || policyData.maxdays

            if (!policyName || !maxDaysValue) {
              throw new Error('Missing required fields (Policy Name, Maximum Days Per Year)')
            }

            const isPaid = (policyData.isPaid || policyData.ispaid)?.toUpperCase() === 'YES'
            const documentationRequired = (policyData.documentationRequired || policyData.documentationrequired)?.toUpperCase() === 'YES'
            const documentationTiming = normalizeDocTiming(policyData.documentationTiming || policyData.documentationtiming)
            const allowHalfDays = (policyData.allowHalfDays || policyData.allowhalfdays)?.toUpperCase() !== 'NO'
            const requireManagerComments = (policyData.requireManagerComments || policyData.requiremanagercomments)?.toUpperCase() === 'YES'

            const maxDays = parseInt(maxDaysValue)
            if (isNaN(maxDays) || maxDays <= 0) {
              throw new Error('Maximum Days Per Year must be a positive number')
            }

            const carryOver = policyData.carryOver || policyData.carryover ? parseInt(policyData.carryOver || policyData.carryover) : 0
            const minEmploymentMonths = policyData.minEmploymentMonths || policyData.minemploymentmonths ? parseInt(policyData.minEmploymentMonths || policyData.minemploymentmonths) : 0
            const noticePeriod = policyData.noticePeriod || policyData.noticeperiod ? parseInt(policyData.noticePeriod || policyData.noticeperiod) : 0
            const accrualRate = policyData.accrualRate || policyData.accrualrate ? parseFloat(policyData.accrualRate || policyData.accrualrate) : null
            const maxConsecutiveDays = policyData.maxConsecutiveDays || policyData.maxconsecutivedays ? parseInt(policyData.maxConsecutiveDays || policyData.maxconsecutivedays) : null

            let seasonalRestrictions: string | null = null
            const seasonalValue = policyData.seasonalRestrictions || policyData.seasonalrestrictions
            if (seasonalValue) {
              const months = seasonalValue.toString().split(',').map((m: string) => parseInt(m.trim()))
              if (months.some((m: number) => isNaN(m) || m < 1 || m > 12)) {
                throw new Error('Seasonal Restriction Months must be comma-separated months (1-12)')
              }
              seasonalRestrictions = months.join(',')
            }

            const existingPolicy = await prisma.leavePolicy.findFirst({
              where: { companyId: companyId, name: policyName }
            })

            const policyDataToSave = {
              companyId: companyId,
              name: policyName,
              description: policyData.description || '',
              maxDays: maxDays,
              carryOver: carryOver,
              isPaid: isPaid,
              accrualRate: accrualRate,
              minEmploymentMonths: minEmploymentMonths,
              // All leave needs approval — no longer configurable per the sheet.
              // Who approves each leave type is set in the Leave Settings UI, so
              // approvalWorkflow is left at its stored/default value here.
              requiresApproval: true,
              noticePeriod: noticePeriod,
              documentationRequired: documentationRequired,
              documentationTiming: documentationTiming,
              allowHalfDays: allowHalfDays,
              maxConsecutiveDays: maxConsecutiveDays,
              seasonalRestrictions: seasonalRestrictions,
              requireManagerComments: requireManagerComments
            }

            if (existingPolicy) {
              await prisma.leavePolicy.update({
                where: { id: existingPolicy.id },
                data: policyDataToSave
              })
              results.policies.updated++
            } else {
              await prisma.leavePolicy.create({ data: policyDataToSave })
              results.policies.created++
            }

          } catch (error: any) {
            results.policies.failed++
            results.policies.errors.push(`Row ${rowNumber}: ${error.message}`)
            results.policies.failedRecords.push({
              sheetType: 'POLICIES',
              rowData: policyData,
              error: error.message,
              suggestion: getPolicyErrorSuggestion(error.message, policyData)
            })
          }
        }
      }
    } catch (error: any) {
      results.policies.errors.push(`Error processing policies sheet: ${error.message}`)
    }

    // ============ ENSURE EVERY POLICY HAS A SELECTABLE TYPE ============
    // Makes the Leave Types sheet optional: a policy with no type gets one
    // named after it, so it shows up in the apply dropdown immediately.
    try {
      const auto = await ensureDefaultLeaveTypes(prisma, companyId)
      results.leaveTypes.created += auto.created
      results.leaveTypes.errors.push(...auto.errors)
    } catch (error: any) {
      results.leaveTypes.errors.push(`Auto leave-type creation failed: ${error.message}`)
    }

  } catch (error: any) {
    throw new Error(`Failed to process file: ${error.message}`)
  }

  // Compile all failed records
  const allFailedRecords = [
    ...results.leaveTypes.failedRecords,
    ...results.policies.failedRecords
  ]

  // Update upload record
  const updatedUpload = await prisma.leave_uploads.update({
    where: { id: leaveUpload.id },
    data: {
      leaveTypesCreated: results.leaveTypes.created,
      leaveTypesUpdated: results.leaveTypes.updated,
      leaveTypesFailed: results.leaveTypes.failed,
      policiesCreated: results.policies.created,
      policiesUpdated: results.policies.updated,
      policiesFailed: results.policies.failed,
      failedRecords: allFailedRecords.length > 0 ? JSON.stringify(allFailedRecords) : Prisma.DbNull
    }
  })

  return {
    upload: updatedUpload,
    results,
    hasFailedRecords: allFailedRecords.length > 0,
    totalFailed: results.leaveTypes.failed + results.policies.failed
  }
}

// Helper function to download failed records
async function downloadFailedRecords(
  upload: any, 
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
    
    const csvField = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
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

// -----------------------------
// OPTIONS - CORS preflight
// -----------------------------
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// -----------------------------
// GET - Download Template or Failed Records
// -----------------------------
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { success: false, message: 'Authorization header missing' },
        { status: 401 }
      )
      return withCors(response, origin)
    }
    
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'LEAVE', ['HR', 'SUPER_ADMIN', 'ADMIN'])
    
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const action = searchParams.get('action')
    const uploadId = searchParams.get('uploadId')
    const format = searchParams.get('format') || 'excel'

    // Handle failed records download
    if (action === 'failed' && uploadId) {
      const upload = await prisma.leave_uploads.findFirst({
        where: { id: uploadId, uploadedBy: user.userId }
      })
      
      if (!upload) {
        const response = NextResponse.json(
          { success: false, message: 'Upload not found or you do not have access' },
          { status: 404 }
        )
        return withCors(response, origin)
      }
      
      if (!upload.failedRecords) {
        const response = NextResponse.json(
          { success: false, message: 'No failed records found for this upload' },
          { status: 404 }
        )
        return withCors(response, origin)
      }

      let failedRecords: FailedRecord[] = []
      try {
        const fr = upload.failedRecords
        if (!fr) {
          failedRecords = []
        } else if (typeof fr === 'string') {
          const parsed = JSON.parse(fr)
          if (Array.isArray(parsed)) {
            failedRecords = parsed.filter(Boolean).map((r: any) => ({
              sheetType: r?.sheetType,
              rowData: r?.rowData,
              error: r?.error,
              suggestion: r?.suggestion
            } as FailedRecord))
          }
        } else if (Array.isArray(fr)) {
          failedRecords = fr.filter(Boolean).map((r: any) => ({
            sheetType: r?.sheetType,
            rowData: r?.rowData,
            error: r?.error,
            suggestion: r?.suggestion
          } as FailedRecord))
        }
      } catch (e) {
        const response = NextResponse.json(
          { success: false, message: 'Failed to parse failed records' },
          { status: 500 }
        )
        return withCors(response, origin)
      }

      if (failedRecords.length === 0) {
        const response = NextResponse.json(
          { success: false, message: 'No failed records found for this upload' },
          { status: 404 }
        )
        return withCors(response, origin)
      }

      return await downloadFailedRecords(upload, failedRecords, format, origin)
    }

    // Template download
    if (!companyId) {
      const response = NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const company = await prisma.company.findFirst({
      where: { id: companyId, archived: 0 },
      select: { id: true, companyName: true }
    })

    if (!company) {
      const response = NextResponse.json(
        { success: false, message: 'Company not found or is archived' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    let hasAccess = false
    
    if (user.role === 'SUPER_ADMIN') {
      hasAccess = true
    } else if (user.role === 'HR') {
      hasAccess = user.companyId === companyId
    } else if (user.role === 'ADMIN') {
      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: user.userId, companyId, role: { in: ['ADMIN', 'ALL'] } }
      })
      hasAccess = !!userCompany
    }
    
    if (!hasAccess) {
      const response = NextResponse.json(
        { success: false, message: 'You do not have permission to download templates' },
        { status: 403 }
      )
      return withCors(response, origin)
    }

    if (action === 'template') {
      return await downloadTemplate(company, format, origin)
    }

    // Upload history for this company (Leave Policy page)
    if (action === 'list') {
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10) || 10))

      const [uploads, totalCount] = await Promise.all([
        prisma.leave_uploads.findMany({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.leave_uploads.count({ where: { companyId } }),
      ])

      const uploaderIds = [...new Set(uploads.map((u) => u.uploadedBy))]
      const uploaders = uploaderIds.length
        ? await prisma.staffRecord.findMany({
            where: { id: { in: uploaderIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : []
      const uploaderById = new Map(uploaders.map((s) => [s.id, s]))

      const data = uploads.map(({ filePath, failedRecords, ...upload }) => {
        const uploader = uploaderById.get(upload.uploadedBy)
        const uploaderName = uploader ? `${uploader.firstName || ''} ${uploader.lastName || ''}`.trim() : ''
        let errors: { sheetType?: string; error?: string }[] = []
        try {
          const fr = typeof failedRecords === 'string' ? JSON.parse(failedRecords) : failedRecords
          if (Array.isArray(fr)) {
            errors = fr.filter(Boolean).map((r: any) => ({ sheetType: r?.sheetType, error: r?.error }))
          }
        } catch {
          errors = []
        }
        return {
          ...upload,
          uploadedByName: uploaderName || uploader?.email || null,
          errors,
        }
      })

      const response = NextResponse.json({
        success: true,
        data: {
          uploads: data,
          pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
        },
      })
      return withCors(response, origin)
    }

    const response = NextResponse.json(
      { success: false, message: 'Invalid action' },
      { status: 400 }
    )
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Error in GET /api/leaves/upload:', error)
    const response = NextResponse.json(
      { success: false, message: 'Failed to process request', details: error.message },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}

// -----------------------------
// POST - Upload and Process Leave Management Data
// -----------------------------
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { success: false, message: 'Authorization header missing' },
        { status: 401 }
      )
      return withCors(response, origin)
    }
    
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'LEAVE', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File
    const companyId = formData.get('companyId') as string

    if (!companyId) {
      const response = NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const company = await prisma.company.findFirst({
      where: { id: companyId, archived: 0 },
      select: { id: true, companyName: true }
    })

    if (!company) {
      const response = NextResponse.json(
        { success: false, message: 'Company not found or is archived' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    let hasAccess = false
    
    if (user.role === 'SUPER_ADMIN') {
      hasAccess = true
    } else if (user.role === 'HR') {
      hasAccess = user.companyId === companyId
    } else if (user.role === 'ADMIN') {
      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: user.userId, companyId, role: { in: ['ADMIN', 'ALL'] } }
      })
      hasAccess = !!userCompany
    }
    
    if (!hasAccess) {
      const response = NextResponse.json(
        { success: false, message: 'You do not have access to upload leave data for this company' },
        { status: 403 }
      )
      return withCors(response, origin)
    }

    if (!file) {
      const response = NextResponse.json(
        { success: false, message: 'No file uploaded' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    const isExcel = ['xlsx', 'xls'].includes(fileExtension || '')

    if (!isCsv && !isExcel) {
      const response = NextResponse.json(
        { success: false, message: 'Invalid file type. Please upload Excel (.xlsx, .xls) or CSV files.' },
        { status: 400 }
      )
      return withCors(response, origin)
    }

    const { uploadsDir, leavesDir } = await ensureUploadDirectories()
    const fileName = `leave-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const savedFilePath = path.join(leavesDir, fileName)
    const relativeFilePath = getRelativePath(savedFilePath)

    const bytes = await file.arrayBuffer()
    await writeFile(savedFilePath, Buffer.from(bytes))

    const processResult = await processLeaveUpload(companyId, file, user.userId, file.name, relativeFilePath)

    const response = NextResponse.json({
      success: true,
      message: 'Leave management data processing completed',
      data: {
        summary: {
          uploadId: processResult.upload.id,
          companyId: companyId,
          companyName: company.companyName,
          totalProcessed: {
            leaveTypes: processResult.results.leaveTypes.created + processResult.results.leaveTypes.updated + processResult.results.leaveTypes.failed,
            policies: processResult.results.policies.created + processResult.results.policies.updated + processResult.results.policies.failed
          },
          successful: {
            leaveTypes: processResult.results.leaveTypes.created + processResult.results.leaveTypes.updated,
            policies: processResult.results.policies.created + processResult.results.policies.updated
          },
          failed: {
            leaveTypes: processResult.results.leaveTypes.failed,
            policies: processResult.results.policies.failed
          },
          hasFailedRecords: processResult.hasFailedRecords,
          downloadFailedUrl: `/api/leaves/upload?action=failed&uploadId=${processResult.upload.id}&format=excel`
        },
        details: processResult.results
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Error in POST /api/leaves/upload:', error)
    const response = NextResponse.json(
      { success: false, message: 'Failed to process leave upload', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}