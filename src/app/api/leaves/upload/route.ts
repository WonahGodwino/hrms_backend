// src/app/api/leaves/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { randomUUID } from 'crypto'

// Define types for failed records
interface FailedRecord {
  sheetType: 'POLICIES' | 'LEAVE_TYPES' | 'HOLIDAYS' | 'BLACKOUT_PERIODS'
  rowData: any
  error: string
  suggestion?: string
}

interface ProcessResults {
  policies: {
    created: number
    updated: number
    failed: number
    errors: string[]
    failedRecords: FailedRecord[]
  }
  leaveTypes: {
    created: number
    updated: number
    failed: number
    errors: string[]
    failedRecords: FailedRecord[]
  }
  holidays: {
    created: number
    updated: number
    failed: number
    errors: string[]
    failedRecords: FailedRecord[]
  }
  blackoutPeriods: {
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

function normalizeHeader(header: string): string {
  return header
    .toString()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase()
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

// Improved parseSheetData that intelligently finds headers
function parseSheetData(sheet: ExcelJS.Worksheet, expectedHeaders: string[]): any[] {
  const data: any[] = []
  
  // Find the first row that contains expected headers
  let headerRowNumber = -1
  let foundHeaders: string[] = []
  
  // Search first 20 rows for headers
  for (let rowNum = 1; rowNum <= Math.min(20, sheet.rowCount); rowNum++) {
    const row = sheet.getRow(rowNum)
    const rowHeaders: string[] = []
    
    row.eachCell((cell, colNumber) => {
      const value = cellToString(cell.value)
      if (value && !value.startsWith('📋') && !value.includes('INSTRUCTIONS') && !value.startsWith('•')) {
        const normalized = normalizeHeader(value)
        rowHeaders[colNumber - 1] = normalized
      }
    })
    
    // Count how many expected headers we found in this row
    const foundCount = rowHeaders.filter(h => h && expectedHeaders.includes(h)).length
    if (foundCount >= Math.min(3, expectedHeaders.length) && foundCount >= expectedHeaders.length / 2) {
      headerRowNumber = rowNum
      foundHeaders = rowHeaders
      break
    }
  }
  
  if (headerRowNumber === -1) {
    throw new Error(`Could not find header row with required columns. Expected: ${expectedHeaders.slice(0, 3).join(', ')}...`)
  }
  
  // Validate required headers are present
  const missingHeaders = expectedHeaders.filter(h => !foundHeaders.includes(h.toLowerCase()))
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`)
  }
  
  // Process data rows starting from the row after headers
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const rowData: any = {}
    let hasData = false
    let isInstructionRow = false
    
    foundHeaders.forEach((header, colIndex) => {
      if (header) {
        const cell = row.getCell(colIndex + 1)
        const value = cellToString(cell.value)
        
        // Skip rows that are clearly instructions or metadata
        const lowerValue = value.toLowerCase()
        if (value && (lowerValue.includes('instruction') || 
            lowerValue.startsWith('📋') || 
            lowerValue.startsWith('#') ||
            lowerValue.startsWith('•') ||
            lowerValue.includes('delete sample') ||
            lowerValue.includes('required fields'))) {
          isInstructionRow = true
        }
        
        if (value && !isInstructionRow) {
          hasData = true
        }
        rowData[header] = value
      }
    })
    
    // Only add rows that have actual data and aren't instruction rows
    if (hasData && !isInstructionRow) {
      // Check if this row has any meaningful data (not all empty strings)
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
  if (error.includes('approvalWorkflow')) {
    return 'Use: MANAGER_THEN_HR, MANAGER_ONLY, HR_ONLY, or NONE'
  }
  if (error.includes('maxDays')) {
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

// Clean template download function
async function downloadTemplate(company: any, format: string, origin: string | null) {
  const workbook = new ExcelJS.Workbook()
  
  // Helper function to style header row
  const styleHeaderRow = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    row.alignment = { vertical: 'middle', horizontal: 'center' }
    row.height = 25
  }
  
  // ============ SHEET 1: Leave Policies ============
  const policiesSheet = workbook.addWorksheet('Leave Policies')
  
  const policyHeaders = [
    'policyName*', 'description', 'maxDays*', 'carryOver', 'isPaid', 
    'accrualRate', 'minEmploymentMonths', 'requiresApproval', 'approvalWorkflow*', 
    'noticePeriod', 'documentationRequired', 'allowHalfDays', 'maxConsecutiveDays', 
    'seasonalRestrictions', 'requireManagerComments'
  ]
  
  const policyHeaderRow = policiesSheet.addRow(policyHeaders)
  styleHeaderRow(policyHeaderRow)
  
  // Add sample data
  const samplePolicy = policiesSheet.addRow({
    policyName: 'Annual Leave',
    description: 'Paid time off for vacation',
    maxDays: '20',
    carryOver: '5',
    isPaid: 'YES',
    accrualRate: '1.67',
    minEmploymentMonths: '3',
    requiresApproval: 'YES',
    approvalWorkflow: 'MANAGER_THEN_HR',
    noticePeriod: '14',
    documentationRequired: 'NO',
    allowHalfDays: 'YES',
    maxConsecutiveDays: '15',
    seasonalRestrictions: '12,1',
    requireManagerComments: 'YES'
  })
  samplePolicy.alignment = { vertical: 'middle', horizontal: 'left' }
  
  // Add another sample
  const samplePolicy2 = policiesSheet.addRow({
    policyName: 'Sick Leave',
    description: 'Paid sick leave',
    maxDays: '12',
    carryOver: '0',
    isPaid: 'YES',
    accrualRate: '1.0',
    minEmploymentMonths: '0',
    requiresApproval: 'YES',
    approvalWorkflow: 'MANAGER_ONLY',
    noticePeriod: '0',
    documentationRequired: 'YES',
    allowHalfDays: 'YES',
    maxConsecutiveDays: '5',
    seasonalRestrictions: '',
    requireManagerComments: 'NO'
  })
  samplePolicy2.alignment = { vertical: 'middle', horizontal: 'left' }
  
  // Add instructions section
  policiesSheet.addRow([])
  const instructionTitle = policiesSheet.getCell('A5')
  instructionTitle.value = '📋 INSTRUCTIONS:'
  instructionTitle.font = { bold: true, size: 11 }
  
  const instructions = [
    '• Required fields are marked with *',
    '• approvalWorkflow options: MANAGER_THEN_HR, MANAGER_ONLY, HR_ONLY, NONE',
    '• Boolean fields (isPaid, requiresApproval, etc.): Use "YES" or "NO"',
    '• seasonalRestrictions: Comma-separated months (1-12) e.g., "1,2,12" for Jan, Feb, Dec',
    '• Delete the sample rows (rows 2-3) before uploading your data',
    '• Add your data starting from row 2'
  ]
  
  instructions.forEach((instruction, idx) => {
    const cell = policiesSheet.getCell(`A${6 + idx}`)
    cell.value = instruction
    cell.font = { italic: true, color: { argb: 'FF666666' }, size: 10 }
  })
  
  // Set column widths
  policiesSheet.columns = [
    { width: 20 }, { width: 30 }, { width: 12 }, { width: 12 }, { width: 10 },
    { width: 12 }, { width: 20 }, { width: 18 }, { width: 25 }, { width: 15 },
    { width: 25 }, { width: 15 }, { width: 20 }, { width: 20 }, { width: 25 }
  ]
  
  // ============ SHEET 2: Leave Types ============
  const typesSheet = workbook.addWorksheet('Leave Types')
  
  const typeHeaders = ['policyName*', 'typeName*', 'code*', 'description', 'color', 'isActive']
  const typeHeaderRow = typesSheet.addRow(typeHeaders)
  styleHeaderRow(typeHeaderRow)
  
  // Add sample data
  const sampleType = typesSheet.addRow({
    policyName: 'Annual Leave',
    typeName: 'Vacation Leave', 
    code: 'VL',
    description: 'Regular vacation time off',
    color: '#3B82F6',
    isActive: 'YES'
  })
  sampleType.alignment = { vertical: 'middle', horizontal: 'left' }
  
  const sampleType2 = typesSheet.addRow({
    policyName: 'Sick Leave',
    typeName: 'Sick Leave',
    code: 'SL',
    description: 'Paid sick leave',
    color: '#EF4444',
    isActive: 'YES'
  })
  sampleType2.alignment = { vertical: 'middle', horizontal: 'left' }
  
  // Instructions
  typesSheet.addRow([])
  const typeInstructionTitle = typesSheet.getCell('A5')
  typeInstructionTitle.value = '📋 INSTRUCTIONS:'
  typeInstructionTitle.font = { bold: true, size: 11 }
  
  const typeInstructions = [
    '• policyName must match exactly with a policy from the "Leave Policies" sheet',
    '• code: 2-4 uppercase alphanumeric characters (e.g., "AL", "SL", "ML")',
    '• isActive: "YES" or "NO" (defaults to YES if empty)',
    '• color: Hex color code (e.g., "#3B82F6")',
    '• Delete sample rows before uploading your data'
  ]
  
  typeInstructions.forEach((instruction, idx) => {
    const cell = typesSheet.getCell(`A${6 + idx}`)
    cell.value = instruction
    cell.font = { italic: true, color: { argb: 'FF666666' }, size: 10 }
  })
  
  typesSheet.columns = [{ width: 20 }, { width: 20 }, { width: 10 }, { width: 30 }, { width: 15 }, { width: 10 }]
  
  // ============ SHEET 3: Public Holidays ============
  const holidaysSheet = workbook.addWorksheet('Public Holidays')
  
  const holidayHeaders = ['holidayName*', 'dateOrPattern*', 'description', 'isRecurring', 'country', 'state']
  const holidayHeaderRow = holidaysSheet.addRow(holidayHeaders)
  styleHeaderRow(holidayHeaderRow)
  
  // Add sample data
  const sampleHoliday = holidaysSheet.addRow({
    holidayName: "New Year's Day",
    dateOrPattern: '01-01',
    description: 'Celebration of new year',
    isRecurring: 'YES',
    country: 'NG',
    state: 'All'
  })
  sampleHoliday.alignment = { vertical: 'middle', horizontal: 'left' }
  
  const sampleHoliday2 = holidaysSheet.addRow({
    holidayName: "Independence Day",
    dateOrPattern: '10-01',
    description: 'National Independence Day',
    isRecurring: 'YES',
    country: 'NG',
    state: 'All'
  })
  sampleHoliday2.alignment = { vertical: 'middle', horizontal: 'left' }
  
  // Instructions
  holidaysSheet.addRow([])
  const holidayInstructionTitle = holidaysSheet.getCell('A5')
  holidayInstructionTitle.value = '📋 INSTRUCTIONS:'
  holidayInstructionTitle.font = { bold: true, size: 11 }
  
  const holidayInstructions = [
    '• For recurring holidays: Use MM-DD format (e.g., "01-01" for January 1st)',
    '• For specific dates: Use YYYY-MM-DD format (e.g., "2025-12-25")',
    '• isRecurring: "YES" or "NO"',
    '• country and state are optional but recommended',
    '• Delete sample rows before uploading your data'
  ]
  
  holidayInstructions.forEach((instruction, idx) => {
    const cell = holidaysSheet.getCell(`A${6 + idx}`)
    cell.value = instruction
    cell.font = { italic: true, color: { argb: 'FF666666' }, size: 10 }
  })
  
  holidaysSheet.columns = [{ width: 25 }, { width: 20 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 15 }]
  
  // ============ SHEET 4: Blackout Periods ============
  const blackoutSheet = workbook.addWorksheet('Blackout Periods')
  
  const blackoutHeaders = ['periodName*', 'startDate*', 'endDate*', 'reason', 'appliesToAllLeaveTypes', 'policyName']
  const blackoutHeaderRow = blackoutSheet.addRow(blackoutHeaders)
  styleHeaderRow(blackoutHeaderRow)
  
  // Add sample data
  const currentYear = new Date().getFullYear()
  const sampleBlackout = blackoutSheet.addRow({
    periodName: 'Year-End Shutdown',
    startDate: `${currentYear}-12-20`,
    endDate: `${currentYear}-12-31`,
    reason: 'Company-wide holiday shutdown',
    appliesToAllLeaveTypes: 'YES',
    policyName: ''
  })
  sampleBlackout.alignment = { vertical: 'middle', horizontal: 'left' }
  
  // Instructions
  blackoutSheet.addRow([])
  const blackoutInstructionTitle = blackoutSheet.getCell('A5')
  blackoutInstructionTitle.value = '📋 INSTRUCTIONS:'
  blackoutInstructionTitle.font = { bold: true, size: 11 }
  
  const blackoutInstructions = [
    '• Use YYYY-MM-DD format for all dates',
    '• appliesToAllLeaveTypes: "YES" or "NO" (defaults to YES if empty)',
    '• If appliesToAllLeaveTypes is "NO", specify the exact policyName to restrict',
    '• policyName must match a policy from the "Leave Policies" sheet',
    '• Blackout periods are optional - leave this sheet blank if not needed',
    '• Delete sample rows before uploading your data'
  ]
  
  blackoutInstructions.forEach((instruction, idx) => {
    const cell = blackoutSheet.getCell(`A${6 + idx}`)
    cell.value = instruction
    cell.font = { italic: true, color: { argb: 'FF666666' }, size: 10 }
  })
  
  blackoutSheet.columns = [{ width: 25 }, { width: 15 }, { width: 15 }, { width: 30 }, { width: 25 }, { width: 20 }]
  
  // Style alternating rows for data rows across all sheets
  workbook.eachSheet((worksheet: ExcelJS.Worksheet) => {
    worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber === 2 || rowNumber === 3) {
        // Style data rows with light background
        if (rowNumber === 3) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } }
        }
        row.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      }
    })
  })

  if (format === 'csv') {
    // Build CSV content
    let csvContent = '# LEAVE MANAGEMENT TEMPLATE\n'
    csvContent += `# Company: ${company.companyName}\n`
    csvContent += `# Generated: ${new Date().toISOString()}\n`
    csvContent += '# Instructions: Lines starting with # are comments\n'
    csvContent += '# Delete the sample rows and add your data below\n\n'
    
    // Leave Policies sheet
    csvContent += '## LEAVE POLICIES ##\n'
    csvContent += '"policyName*","description","maxDays*","carryOver","isPaid","accrualRate","minEmploymentMonths","requiresApproval","approvalWorkflow*","noticePeriod","documentationRequired","allowHalfDays","maxConsecutiveDays","seasonalRestrictions","requireManagerComments"\n'
    csvContent += '"Annual Leave","Paid time off for vacation","20","5","YES","1.67","3","YES","MANAGER_THEN_HR","14","NO","YES","15","12,1","YES"\n'
    csvContent += '"Sick Leave","Paid sick leave","12","0","YES","1.0","0","YES","MANAGER_ONLY","0","YES","YES","5","","NO"\n\n'
    
    // Leave Types sheet
    csvContent += '## LEAVE TYPES ##\n'
    csvContent += '"policyName*","typeName*","code*","description","color","isActive"\n'
    csvContent += '"Annual Leave","Vacation Leave","VL","Regular vacation time off","#3B82F6","YES"\n'
    csvContent += '"Sick Leave","Sick Leave","SL","Paid sick leave","#EF4444","YES"\n\n'
    
    // Public Holidays sheet
    csvContent += '## PUBLIC HOLIDAYS ##\n'
    csvContent += '"holidayName*","dateOrPattern*","description","isRecurring","country","state"\n'
    csvContent += '"New Year\'s Day","01-01","Celebration of new year","YES","NG","All"\n'
    csvContent += '"Independence Day","10-01","National Independence Day","YES","NG","All"\n\n'
    
    // Blackout Periods sheet
    csvContent += '## BLACKOUT PERIODS ##\n'
    csvContent += '"periodName*","startDate*","endDate*","reason","appliesToAllLeaveTypes","policyName"\n'
    csvContent += `"Year-End Shutdown","${currentYear}-12-20","${currentYear}-12-31","Company-wide holiday shutdown","YES",""\n`
    
    const response = new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leave-template-${company.companyName.replace(/[^a-zA-Z0-9]/g, '_')}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
    return withCors(response, origin)
  } else {
    const buffer = await workbook.xlsx.writeBuffer()

    const response = new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leave-template-${company.companyName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx"`,
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
    policies: { created: 0, updated: 0, failed: 0, errors: [], failedRecords: [] },
    leaveTypes: { created: 0, updated: 0, failed: 0, errors: [], failedRecords: [] },
    holidays: { created: 0, updated: 0, failed: 0, errors: [], failedRecords: [] },
    blackoutPeriods: { created: 0, updated: 0, failed: 0, errors: [], failedRecords: [] }
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

    // ============ PROCESS LEAVE POLICIES ============
    try {
      const policiesSheet = workbook.getWorksheet('Leave Policies')
      if (!policiesSheet) {
        results.policies.errors.push('Missing "Leave Policies" worksheet')
      } else {
        const policiesData = parseSheetData(policiesSheet, [
          'policyName', 'description', 'maxDays', 'carryOver', 'isPaid',
          'accrualRate', 'minEmploymentMonths', 'requiresApproval', 'approvalWorkflow',
          'noticePeriod', 'documentationRequired', 'allowHalfDays', 'maxConsecutiveDays',
          'seasonalRestrictions', 'requireManagerComments'
        ])

        for (let i = 0; i < policiesData.length; i++) {
          const rowNumber = i + 2
          const policyData = policiesData[i]
          
          try {
            if (!policyData.policyName || !policyData.maxDays || !policyData.approvalWorkflow) {
              throw new Error('Missing required fields (policyName, maxDays, approvalWorkflow)')
            }

            const validWorkflows = ['MANAGER_THEN_HR', 'MANAGER_ONLY', 'HR_ONLY', 'NONE']
            if (!validWorkflows.includes(policyData.approvalWorkflow)) {
              throw new Error(`Invalid approvalWorkflow. Must be one of: ${validWorkflows.join(', ')}`)
            }

            const isPaid = policyData.isPaid?.toUpperCase() === 'YES'
            const requiresApproval = policyData.requiresApproval?.toUpperCase() === 'YES'
            const documentationRequired = policyData.documentationRequired?.toUpperCase() === 'YES'
            const allowHalfDays = policyData.allowHalfDays?.toUpperCase() !== 'NO'
            const requireManagerComments = policyData.requireManagerComments?.toUpperCase() === 'YES'

            const maxDays = parseInt(policyData.maxDays)
            if (isNaN(maxDays) || maxDays <= 0) {
              throw new Error('maxDays must be a positive number')
            }

            const carryOver = policyData.carryOver ? parseInt(policyData.carryOver) : 0
            const minEmploymentMonths = policyData.minEmploymentMonths ? parseInt(policyData.minEmploymentMonths) : 0
            const noticePeriod = policyData.noticePeriod ? parseInt(policyData.noticePeriod) : 0
            const accrualRate = policyData.accrualRate ? parseFloat(policyData.accrualRate) : null
            const maxConsecutiveDays = policyData.maxConsecutiveDays ? parseInt(policyData.maxConsecutiveDays) : null

            let seasonalRestrictions: string | null = null
            if (policyData.seasonalRestrictions) {
              const months = policyData.seasonalRestrictions.split(',').map((m: string) => parseInt(m.trim()))
              if (months.some((m: number) => isNaN(m) || m < 1 || m > 12)) {
                throw new Error('seasonalRestrictions must be comma-separated months (1-12)')
              }
              seasonalRestrictions = months.join(',')
            }

            const existingPolicy = await prisma.leavePolicy.findFirst({
              where: { companyId: companyId, name: policyData.policyName }
            })

            const policyDataToSave = {
              companyId: companyId,
              name: policyData.policyName,
              description: policyData.description || '',
              maxDays: maxDays,
              carryOver: carryOver,
              isPaid: isPaid,
              accrualRate: accrualRate,
              minEmploymentMonths: minEmploymentMonths,
              requiresApproval: requiresApproval,
              approvalWorkflow: policyData.approvalWorkflow,
              noticePeriod: noticePeriod,
              documentationRequired: documentationRequired,
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

    // ============ PROCESS LEAVE TYPES ============
    try {
      const typesSheet = workbook.getWorksheet('Leave Types')
      if (!typesSheet) {
        results.leaveTypes.errors.push('Missing "Leave Types" worksheet')
      } else {
        const typesData = parseSheetData(typesSheet, ['policyName', 'typeName', 'code', 'description', 'color', 'isActive'])
        const policies = await prisma.leavePolicy.findMany({ where: { companyId: companyId } })
        const policyMap = new Map(policies.map((p: any) => [p.name, p.id]))

        for (let i = 0; i < typesData.length; i++) {
          const rowNumber = i + 2
          const typeData = typesData[i]
          
          try {
            if (!typeData.policyName || !typeData.typeName || !typeData.code) {
              throw new Error('Missing required fields (policyName, typeName, code)')
            }

            const policyId = policyMap.get(typeData.policyName)
            if (!policyId) {
              throw new Error(`Policy "${typeData.policyName}" not found. Create policy first.`)
            }

            const codeRegex = /^[A-Z0-9]{2,4}$/
            if (!codeRegex.test(typeData.code)) {
              throw new Error('Code must be 2-4 uppercase alphanumeric characters')
            }

            const isActive = typeData.isActive?.toUpperCase() !== 'NO'
            const existingType = await prisma.leaveType.findFirst({
              where: { policyId: policyId, OR: [{ name: typeData.typeName }, { code: typeData.code }] }
            })

            const typeDataToSave = {
              policyId: policyId,
              name: typeData.typeName,
              code: typeData.code,
              description: typeData.description || '',
              color: typeData.color || '#3B82F6',
              isActive: isActive
            }

            if (existingType) {
              await prisma.leaveType.update({ where: { id: existingType.id }, data: typeDataToSave })
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

    // ============ PROCESS PUBLIC HOLIDAYS ============
    try {
      const holidaysSheet = workbook.getWorksheet('Public Holidays')
      if (!holidaysSheet) {
        results.holidays.errors.push('Missing "Public Holidays" worksheet')
      } else {
        const holidaysData = parseSheetData(holidaysSheet, ['holidayName', 'dateOrPattern', 'description', 'isRecurring', 'country', 'state'])

        for (let i = 0; i < holidaysData.length; i++) {
          const rowNumber = i + 2
          const holidayData = holidaysData[i]
          
          try {
            if (!holidayData.holidayName || !holidayData.dateOrPattern) {
              throw new Error('Missing required fields (holidayName, dateOrPattern)')
            }

            const isRecurring = holidayData.isRecurring?.toUpperCase() === 'YES'
            let holidayDate: Date

            if (isRecurring) {
              const patternMatch = holidayData.dateOrPattern.match(/^(\d{1,2})-(\d{1,2})$/)
              if (!patternMatch) {
                throw new Error('Invalid date pattern for recurring holiday. Use MM-DD format')
              }
              const month = parseInt(patternMatch[1]) - 1
              const day = parseInt(patternMatch[2])
              if (month < 0 || month > 11 || day < 1 || day > 31) {
                throw new Error('Invalid date values')
              }
              holidayDate = new Date(new Date().getFullYear(), month, day)
            } else {
              holidayDate = new Date(holidayData.dateOrPattern)
              if (isNaN(holidayDate.getTime())) {
                throw new Error('Invalid date format. Use YYYY-MM-DD for specific dates')
              }
            }

            const existingHoliday = await prisma.publicHoliday.findFirst({
              where: { companyId: companyId, date: holidayDate, name: holidayData.holidayName }
            })

            const holidayDataToSave = {
              companyId: companyId,
              name: holidayData.holidayName,
              date: holidayDate,
              description: holidayData.description || '',
              isRecurring: isRecurring,
              country: holidayData.country || null,
              state: holidayData.state || null
            }

            if (existingHoliday) {
              await prisma.publicHoliday.update({ where: { id: existingHoliday.id }, data: holidayDataToSave })
              results.holidays.updated++
            } else {
              await prisma.publicHoliday.create({ data: holidayDataToSave })
              results.holidays.created++
            }

          } catch (error: any) {
            results.holidays.failed++
            results.holidays.errors.push(`Row ${rowNumber}: ${error.message}`)
            results.holidays.failedRecords.push({
              sheetType: 'HOLIDAYS',
              rowData: holidayData,
              error: error.message
            })
          }
        }
      }
    } catch (error: any) {
      results.holidays.errors.push(`Error processing holidays sheet: ${error.message}`)
    }

    // ============ PROCESS BLACKOUT PERIODS ============
    try {
      const blackoutSheet = workbook.getWorksheet('Blackout Periods')
      if (blackoutSheet) {
        const blackoutData = parseSheetData(blackoutSheet, ['periodName', 'startDate', 'endDate', 'reason', 'appliesToAllLeaveTypes', 'policyName'])
        const policies = await prisma.leavePolicy.findMany({ where: { companyId: companyId } })
        const policyMap = new Map(policies.map((p: any) => [p.name, p.id]))

        for (let i = 0; i < blackoutData.length; i++) {
          const rowNumber = i + 2
          const periodData = blackoutData[i]
          
          try {
            if (!periodData.periodName || !periodData.startDate || !periodData.endDate) {
              throw new Error('Missing required fields (periodName, startDate, endDate)')
            }

            const startDate = new Date(periodData.startDate)
            const endDate = new Date(periodData.endDate)
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              throw new Error('Invalid date format. Use YYYY-MM-DD')
            }

            if (startDate > endDate) {
              throw new Error('Start date must be before end date')
            }

            const appliesToAllLeaveTypes = periodData.appliesToAllLeaveTypes?.toUpperCase() !== 'NO'
            let policyId: string | null = null

            if (!appliesToAllLeaveTypes && periodData.policyName) {
              policyId = policyMap.get(periodData.policyName) || null
              if (!policyId) {
                throw new Error(`Policy "${periodData.policyName}" not found`)
              }
            }

            const existingPeriod = await prisma.leave_blackout_periods.findFirst({
              where: { companyId: companyId, name: periodData.periodName, startDate: startDate, endDate: endDate }
            })

            const periodDataToSave = {
              id: randomUUID(),
              companyId: companyId,
              name: periodData.periodName,
              startDate: startDate,
              endDate: endDate,
              reason: periodData.reason || null,
              appliesToAllLeaveTypes: appliesToAllLeaveTypes,
              policyId: policyId,
              createdAt: new Date(),
              updatedAt: new Date()
            }

            if (existingPeriod) {
              await prisma.leave_blackout_periods.update({
                where: { id: existingPeriod.id },
                data: { ...periodDataToSave, id: existingPeriod.id }
              })
              results.blackoutPeriods.updated++
            } else {
              await prisma.leave_blackout_periods.create({ data: periodDataToSave })
              results.blackoutPeriods.created++
            }

          } catch (error: any) {
            results.blackoutPeriods.failed++
            results.blackoutPeriods.errors.push(`Row ${rowNumber}: ${error.message}`)
            results.blackoutPeriods.failedRecords.push({
              sheetType: 'BLACKOUT_PERIODS',
              rowData: periodData,
              error: error.message
            })
          }
        }
      }
    } catch (error: any) {
      results.blackoutPeriods.errors.push(`Error processing blackout periods sheet: ${error.message}`)
    }

  } catch (error: any) {
    throw new Error(`Failed to process file: ${error.message}`)
  }

  // Compile all failed records
  const allFailedRecords = [
    ...results.policies.failedRecords,
    ...results.leaveTypes.failedRecords,
    ...results.holidays.failedRecords,
    ...results.blackoutPeriods.failedRecords
  ]

  // Update upload record
  const updatedUpload = await prisma.leave_uploads.update({
    where: { id: leaveUpload.id },
    data: {
      policiesCreated: results.policies.created,
      policiesUpdated: results.policies.updated,
      policiesFailed: results.policies.failed,
      leaveTypesCreated: results.leaveTypes.created,
      leaveTypesUpdated: results.leaveTypes.updated,
      leaveTypesFailed: results.leaveTypes.failed,
      holidaysCreated: results.holidays.created,
      holidaysUpdated: results.holidays.updated,
      holidaysFailed: results.holidays.failed,
      blackoutPeriodsCreated: results.blackoutPeriods.created,
      blackoutPeriodsUpdated: results.blackoutPeriods.updated,
      blackoutPeriodsFailed: results.blackoutPeriods.failed,
      failedRecords: allFailedRecords.length > 0 ? JSON.stringify(allFailedRecords) : Prisma.DbNull
    }
  })

  return {
    upload: updatedUpload,
    results,
    hasFailedRecords: allFailedRecords.length > 0,
    totalFailed: results.policies.failed + results.leaveTypes.failed + results.holidays.failed + results.blackoutPeriods.failed
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
  
  const styleHeaderRow = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } }
    row.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  
  const policiesRecords = failedRecords.filter((r: FailedRecord) => r.sheetType === 'POLICIES')
  const leaveTypesRecords = failedRecords.filter((r: FailedRecord) => r.sheetType === 'LEAVE_TYPES')
  const holidaysRecords = failedRecords.filter((r: FailedRecord) => r.sheetType === 'HOLIDAYS')
  const blackoutRecords = failedRecords.filter((r: FailedRecord) => r.sheetType === 'BLACKOUT_PERIODS')

  if (policiesRecords.length > 0) {
    const policiesSheet = workbook.addWorksheet('Failed Policies')
    const summaryRow = policiesSheet.addRow(['❌ FAILED POLICIES - Please correct and re-upload'])
    summaryRow.font = { bold: true, size: 14, color: { argb: 'FFDC3545' } }
    policiesSheet.addRow([`Upload ID: ${upload.id}`])
    policiesSheet.addRow([`Upload Date: ${new Date(upload.createdAt).toISOString()}`])
    policiesSheet.addRow([])
    
    policiesSheet.columns = [
      { header: 'policyName', key: 'policyName', width: 20 },
      { header: 'description', key: 'description', width: 30 },
      { header: 'maxDays', key: 'maxDays', width: 12 },
      { header: 'carryOver', key: 'carryOver', width: 12 },
      { header: 'isPaid', key: 'isPaid', width: 10 },
      { header: 'accrualRate', key: 'accrualRate', width: 12 },
      { header: 'minEmploymentMonths', key: 'minEmploymentMonths', width: 20 },
      { header: 'requiresApproval', key: 'requiresApproval', width: 18 },
      { header: 'approvalWorkflow', key: 'approvalWorkflow', width: 25 },
      { header: 'noticePeriod', key: 'noticePeriod', width: 15 },
      { header: 'documentationRequired', key: 'documentationRequired', width: 25 },
      { header: 'allowHalfDays', key: 'allowHalfDays', width: 15 },
      { header: 'maxConsecutiveDays', key: 'maxConsecutiveDays', width: 20 },
      { header: 'seasonalRestrictions', key: 'seasonalRestrictions', width: 20 },
      { header: 'requireManagerComments', key: 'requireManagerComments', width: 25 },
      { header: '❌ ERROR', key: 'error', width: 50 },
      { header: '💡 SUGGESTION', key: 'suggestion', width: 50 }
    ]
    
    const headerRow = policiesSheet.getRow(5)
    styleHeaderRow(headerRow)
    
    policiesRecords.forEach((record: FailedRecord) => {
      const row = policiesSheet.addRow({
        ...record.rowData,
        error: record.error,
        suggestion: record.suggestion || ''
      })
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3F3' } }
    })
  }

  if (leaveTypesRecords.length > 0) {
    const typesSheet = workbook.addWorksheet('Failed Leave Types')
    const summaryRow = typesSheet.addRow(['❌ FAILED LEAVE TYPES - Please correct and re-upload'])
    summaryRow.font = { bold: true, size: 14, color: { argb: 'FFDC3545' } }
    typesSheet.addRow([`Upload ID: ${upload.id}`])
    typesSheet.addRow([`Upload Date: ${new Date(upload.createdAt).toISOString()}`])
    typesSheet.addRow([])
    
    typesSheet.columns = [
      { header: 'policyName', key: 'policyName', width: 20 },
      { header: 'typeName', key: 'typeName', width: 20 },
      { header: 'code', key: 'code', width: 10 },
      { header: 'description', key: 'description', width: 30 },
      { header: 'color', key: 'color', width: 15 },
      { header: 'isActive', key: 'isActive', width: 10 },
      { header: '❌ ERROR', key: 'error', width: 50 }
    ]
    
    const headerRow = typesSheet.getRow(5)
    styleHeaderRow(headerRow)
    
    leaveTypesRecords.forEach((record: FailedRecord) => {
      const row = typesSheet.addRow({ ...record.rowData, error: record.error })
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3F3' } }
    })
  }

  if (holidaysRecords.length > 0) {
    const holidaysSheet = workbook.addWorksheet('Failed Holidays')
    const summaryRow = holidaysSheet.addRow(['❌ FAILED HOLIDAYS - Please correct and re-upload'])
    summaryRow.font = { bold: true, size: 14, color: { argb: 'FFDC3545' } }
    holidaysSheet.addRow([`Upload ID: ${upload.id}`])
    holidaysSheet.addRow([`Upload Date: ${new Date(upload.createdAt).toISOString()}`])
    holidaysSheet.addRow([])
    
    holidaysSheet.columns = [
      { header: 'holidayName', key: 'holidayName', width: 25 },
      { header: 'dateOrPattern', key: 'dateOrPattern', width: 20 },
      { header: 'description', key: 'description', width: 30 },
      { header: 'isRecurring', key: 'isRecurring', width: 15 },
      { header: 'country', key: 'country', width: 15 },
      { header: 'state', key: 'state', width: 15 },
      { header: '❌ ERROR', key: 'error', width: 50 }
    ]
    
    const headerRow = holidaysSheet.getRow(5)
    styleHeaderRow(headerRow)
    
    holidaysRecords.forEach((record: FailedRecord) => {
      const row = holidaysSheet.addRow({ ...record.rowData, error: record.error })
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3F3' } }
    })
  }

  if (blackoutRecords.length > 0) {
    const blackoutSheet = workbook.addWorksheet('Failed Blackout Periods')
    const summaryRow = blackoutSheet.addRow(['❌ FAILED BLACKOUT PERIODS - Please correct and re-upload'])
    summaryRow.font = { bold: true, size: 14, color: { argb: 'FFDC3545' } }
    blackoutSheet.addRow([`Upload ID: ${upload.id}`])
    blackoutSheet.addRow([`Upload Date: ${new Date(upload.createdAt).toISOString()}`])
    blackoutSheet.addRow([])
    
    blackoutSheet.columns = [
      { header: 'periodName', key: 'periodName', width: 25 },
      { header: 'startDate', key: 'startDate', width: 15 },
      { header: 'endDate', key: 'endDate', width: 15 },
      { header: 'reason', key: 'reason', width: 30 },
      { header: 'appliesToAllLeaveTypes', key: 'appliesToAllLeaveTypes', width: 25 },
      { header: 'policyName', key: 'policyName', width: 20 },
      { header: '❌ ERROR', key: 'error', width: 50 }
    ]
    
    const headerRow = blackoutSheet.getRow(5)
    styleHeaderRow(headerRow)
    
    blackoutRecords.forEach((record: FailedRecord) => {
      const row = blackoutSheet.addRow({ ...record.rowData, error: record.error })
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3F3' } }
    })
  }

  if (format === 'csv') {
    let csvContent = '# FAILED RECORDS REPORT\n'
    csvContent += `# Upload ID: ${upload.id}\n`
    csvContent += `# Upload Date: ${new Date(upload.createdAt).toISOString()}\n`
    csvContent += '# Please correct the errors and re-upload\n\n'
    
    if (policiesRecords.length > 0) {
      csvContent += '## FAILED POLICIES ##\n'
      csvContent += '"policyName","description","maxDays","carryOver","isPaid","accrualRate","minEmploymentMonths","requiresApproval","approvalWorkflow","noticePeriod","documentationRequired","allowHalfDays","maxConsecutiveDays","seasonalRestrictions","requireManagerComments","ERROR","SUGGESTION"\n'
      policiesRecords.forEach((record: FailedRecord) => {
        const row = [
          record.rowData.policyName || '', record.rowData.description || '', record.rowData.maxDays || '',
          record.rowData.carryOver || '', record.rowData.isPaid || '', record.rowData.accrualRate || '',
          record.rowData.minEmploymentMonths || '', record.rowData.requiresApproval || '',
          record.rowData.approvalWorkflow || '', record.rowData.noticePeriod || '',
          record.rowData.documentationRequired || '', record.rowData.allowHalfDays || '',
          record.rowData.maxConsecutiveDays || '', record.rowData.seasonalRestrictions || '',
          record.rowData.requireManagerComments || '', record.error, record.suggestion || ''
        ].map((field: any) => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
      csvContent += '\n'
    }
    
    if (leaveTypesRecords.length > 0) {
      csvContent += '## FAILED LEAVE TYPES ##\n'
      csvContent += '"policyName","typeName","code","description","color","isActive","ERROR"\n'
      leaveTypesRecords.forEach((record: FailedRecord) => {
        const row = [
          record.rowData.policyName || '', record.rowData.typeName || '', record.rowData.code || '',
          record.rowData.description || '', record.rowData.color || '', record.rowData.isActive || '', record.error
        ].map((field: any) => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
      csvContent += '\n'
    }
    
    if (holidaysRecords.length > 0) {
      csvContent += '## FAILED HOLIDAYS ##\n'
      csvContent += '"holidayName","dateOrPattern","description","isRecurring","country","state","ERROR"\n'
      holidaysRecords.forEach((record: FailedRecord) => {
        const row = [
          record.rowData.holidayName || '', record.rowData.dateOrPattern || '', record.rowData.description || '',
          record.rowData.isRecurring || '', record.rowData.country || '', record.rowData.state || '', record.error
        ].map((field: any) => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
      csvContent += '\n'
    }
    
    if (blackoutRecords.length > 0) {
      csvContent += '## FAILED BLACKOUT PERIODS ##\n'
      csvContent += '"periodName","startDate","endDate","reason","appliesToAllLeaveTypes","policyName","ERROR"\n'
      blackoutRecords.forEach((record: FailedRecord) => {
        const row = [
          record.rowData.periodName || '', record.rowData.startDate || '', record.rowData.endDate || '',
          record.rowData.reason || '', record.rowData.appliesToAllLeaveTypes || '',
          record.rowData.policyName || '', record.error
        ].map((field: any) => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
    }
    
    const response = new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="failed-records-${upload.id}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
    return withCors(response, origin)
  } else {
    const buffer = await workbook.xlsx.writeBuffer()
    const response = new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="failed-records-${upload.id}.xlsx"`,
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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])
    
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
      where: { id: companyId, archived: 0 }
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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

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
      where: { id: companyId, archived: 0 }
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
            policies: processResult.results.policies.created + processResult.results.policies.updated + processResult.results.policies.failed,
            leaveTypes: processResult.results.leaveTypes.created + processResult.results.leaveTypes.updated + processResult.results.leaveTypes.failed,
            holidays: processResult.results.holidays.created + processResult.results.holidays.updated + processResult.results.holidays.failed,
            blackoutPeriods: processResult.results.blackoutPeriods.created + processResult.results.blackoutPeriods.updated + processResult.results.blackoutPeriods.failed
          },
          successful: {
            policies: processResult.results.policies.created + processResult.results.policies.updated,
            leaveTypes: processResult.results.leaveTypes.created + processResult.results.leaveTypes.updated,
            holidays: processResult.results.holidays.created + processResult.results.holidays.updated,
            blackoutPeriods: processResult.results.blackoutPeriods.created + processResult.results.blackoutPeriods.updated
          },
          failed: {
            policies: processResult.results.policies.failed,
            leaveTypes: processResult.results.leaveTypes.failed,
            holidays: processResult.results.holidays.failed,
            blackoutPeriods: processResult.results.blackoutPeriods.failed
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