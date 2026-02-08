// src/app/api/leaves/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Define types for failed records
interface FailedRecord {
  sheetType: 'POLICIES' | 'LEAVE_TYPES' | 'HOLIDAYS' | 'BLACKOUT_PERIODS'
  rowData: any
  error: string
  suggestion?: string
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
    
    // Handle double quotes
    if (char === '"' && line[i + 1] === '"') {
      current += '"'
      i++
      continue
    }
    
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    
    // Handle comma separator (outside quotes)
    if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }
    
    current += char
  }
  
  // Add the last field
  result.push(current.trim())
  return result
}

function normalizeHeader(header: string): string {
  return header
    .toString()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
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

function parseSheetData(sheet: ExcelJS.Worksheet, expectedHeaders: string[]): any[] {
  const data: any[] = []
  const headers: string[] = []
  
  // Get headers from first row
  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cellToString(cell.value))
    headers[colNumber - 1] = header
  })
  
  // Validate required headers
  const missingHeaders = expectedHeaders.filter(h => !headers.includes(h.toLowerCase()))
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`)
  }
  
  // Process data rows
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const rowData: any = {}
    let isEmpty = true
    
    headers.forEach((header, colIndex) => {
      const cell = row.getCell(colIndex + 1)
      const value = cellToString(cell.value)
      if (value) isEmpty = false
      rowData[header] = value
    })
    
    if (!isEmpty) {
      data.push(rowData)
    }
  }
  
  return data
}

// Manual CSV parsing function to avoid ExcelJS compatibility issues
async function parseCSVToWorkbook(csvText: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Data')
  
  const lines = csvText.split('\n').filter(line => line.trim() !== '')
  
  if (lines.length === 0) {
    throw new Error('Empty CSV file')
  }
  
  lines.forEach((line, rowIndex) => {
    const cells = splitCsvLine(line)
    const row = worksheet.addRow(cells)
    
    // Make header row bold
    if (rowIndex === 0) {
      row.eachCell((cell) => {
        cell.font = { bold: true }
      })
    }
  })
  
  return workbook
}

// Generate error suggestions for policy validation
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

// Download template function
async function downloadTemplate(company: any, format: string, origin: string | null) {
  const workbook = new ExcelJS.Workbook()
  
  // Sheet 1: Leave Policies
  const policiesSheet = workbook.addWorksheet('Leave Policies')
  
  policiesSheet.addRow([`Company: ${company.companyName}`])
  policiesSheet.addRow(['ID:', company.id])
  policiesSheet.addRow([''])
  
  policiesSheet.addRow(['LEAVE POLICIES INSTRUCTIONS:'])
  policiesSheet.addRow(['1. Each row represents a leave policy'])
  policiesSheet.addRow(['2. Fill out all required fields (marked with *)'])
  policiesSheet.addRow(['3. approvalWorkflow options: "MANAGER_THEN_HR", "MANAGER_ONLY", "HR_ONLY", "NONE"'])
  policiesSheet.addRow(['4. Boolean fields (isPaid, requiresApproval, etc.): Use "YES" or "NO"'])
  policiesSheet.addRow(['5. seasonalRestrictions: Comma-separated months (1-12) e.g., "1,2,12"'])
  policiesSheet.addRow([''])
  
  policiesSheet.columns = [
    { header: 'policyName*', key: 'policyName', width: 20 },
    { header: 'description', key: 'description', width: 30 },
    { header: 'maxDays*', key: 'maxDays', width: 12 },
    { header: 'carryOver', key: 'carryOver', width: 12 },
    { header: 'isPaid', key: 'isPaid', width: 10 },
    { header: 'accrualRate', key: 'accrualRate', width: 12 },
    { header: 'minEmploymentMonths', key: 'minEmploymentMonths', width: 20 },
    { header: 'requiresApproval', key: 'requiresApproval', width: 18 },
    { header: 'approvalWorkflow*', key: 'approvalWorkflow', width: 25 },
    { header: 'noticePeriod', key: 'noticePeriod', width: 15 },
    { header: 'documentationRequired', key: 'documentationRequired', width: 25 },
    { header: 'allowHalfDays', key: 'allowHalfDays', width: 15 },
    { header: 'maxConsecutiveDays', key: 'maxConsecutiveDays', width: 20 },
    { header: 'seasonalRestrictions', key: 'seasonalRestrictions', width: 20 },
    { header: 'requireManagerComments', key: 'requireManagerComments', width: 25 }
  ]
  
  const policyHeaderRow = policiesSheet.getRow(11)
  policyHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  policyHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
  policyHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
  
  // Add sample data
  policiesSheet.addRow({
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
  
  // Sheet 2: Leave Types
  const typesSheet = workbook.addWorksheet('Leave Types')
  
  typesSheet.addRow(['LEAVE TYPES INSTRUCTIONS:'])
  typesSheet.addRow(['1. Link each leave type to a policy from Sheet 1'])
  typesSheet.addRow(['2. policyName must match exactly with Sheet 1'])
  typesSheet.addRow(['3. code should be 2-4 characters (e.g., "AL", "SL", "ML")'])
  typesSheet.addRow(['4. isActive: Use "YES" or "NO" (default: YES)'])
  typesSheet.addRow([''])
  
  typesSheet.columns = [
    { header: 'policyName*', key: 'policyName', width: 20 },
    { header: 'typeName*', key: 'typeName', width: 20 },
    { header: 'code*', key: 'code', width: 10 },
    { header: 'description', key: 'description', width: 30 },
    { header: 'color', key: 'color', width: 15 },
    { header: 'isActive', key: 'isActive', width: 10 }
  ]
  
  const typeHeaderRow = typesSheet.getRow(7)
  typeHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  typeHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
  typeHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
  
  // Add sample data
  typesSheet.addRow({
    policyName: 'Annual Leave',
    typeName: 'Vacation Leave',
    code: 'VL',
    description: 'Regular vacation time off',
    color: '#3B82F6',
    isActive: 'YES'
  })
  
  // Sheet 3: Public Holidays
  const holidaysSheet = workbook.addWorksheet('Public Holidays')
  
  holidaysSheet.addRow(['PUBLIC HOLIDAYS INSTRUCTIONS:'])
  holidaysSheet.addRow(['1. Add company-specific public holidays'])
  holidaysSheet.addRow(['2. For recurring holidays, use MM-DD format (e.g., "01-01" for Jan 1)'])
  holidaysSheet.addRow(['3. For specific dates, use YYYY-MM-DD format'])
  holidaysSheet.addRow(['4. isRecurring: Use "YES" or "NO"'])
  holidaysSheet.addRow([''])
  
  holidaysSheet.columns = [
    { header: 'holidayName*', key: 'holidayName', width: 25 },
    { header: 'dateOrPattern*', key: 'dateOrPattern', width: 20 },
    { header: 'description', key: 'description', width: 30 },
    { header: 'isRecurring', key: 'isRecurring', width: 15 },
    { header: 'country', key: 'country', width: 15 },
    { header: 'state', key: 'state', width: 15 }
  ]
  
  const holidayHeaderRow = holidaysSheet.getRow(7)
  holidayHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  holidayHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
  holidayHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
  
  // Add sample data
  holidaysSheet.addRow({
    holidayName: 'New Year\'s Day',
    dateOrPattern: '01-01',
    description: 'Celebration of new year',
    isRecurring: 'YES',
    country: 'NG',
    state: 'All'
  })
  
  // Sheet 4: Blackout Periods (Optional)
  const blackoutSheet = workbook.addWorksheet('Blackout Periods')
  
  blackoutSheet.addRow(['BLACKOUT PERIODS INSTRUCTIONS:'])
  blackoutSheet.addRow(['1. Add company-wide blackout periods (optional)'])
  blackoutSheet.addRow(['2. Use YYYY-MM-DD format for dates'])
  blackoutSheet.addRow(['3. appliesToAllLeaveTypes: Use "YES" or "NO" (default: YES)'])
  blackoutSheet.addRow(['4. If NO, specify policyName to restrict to specific policy'])
  blackoutSheet.addRow([''])
  
  blackoutSheet.columns = [
    { header: 'periodName*', key: 'periodName', width: 25 },
    { header: 'startDate*', key: 'startDate', width: 15 },
    { header: 'endDate*', key: 'endDate', width: 15 },
    { header: 'reason', key: 'reason', width: 30 },
    { header: 'appliesToAllLeaveTypes', key: 'appliesToAllLeaveTypes', width: 25 },
    { header: 'policyName', key: 'policyName', width: 20 }
  ]
  
  const blackoutHeaderRow = blackoutSheet.getRow(8)
  blackoutHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  blackoutHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
  blackoutHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
  
  // Add sample data
  blackoutSheet.addRow({
    periodName: 'Year-End Shutdown',
    startDate: new Date().getFullYear() + '-12-20',
    endDate: new Date().getFullYear() + '-12-31',
    reason: 'Company-wide holiday shutdown',
    appliesToAllLeaveTypes: 'YES',
    policyName: ''
  })
  
  // Style all sheets
  const sheets = [policiesSheet, typesSheet, holidaysSheet, blackoutSheet]
  sheets.forEach((sheet, index) => {
    const startRow = index === 0 ? 12 : (index === 1 ? 8 : (index === 2 ? 8 : 9))
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= startRow) {
        row.alignment = { vertical: 'middle', horizontal: 'left' }
        row.font = { size: 11 }
        if ((rowNumber - startRow) % 2 === 0) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
        }
      }
    })
  })

  if (format === 'csv') {
    // Create CSV for all sheets
    let csvContent = ''
    
    csvContent += 'LEAVE POLICIES\n'
    csvContent += 'policyName*,description,maxDays*,carryOver,isPaid,accrualRate,minEmploymentMonths,requiresApproval,approvalWorkflow*,noticePeriod,documentationRequired,allowHalfDays,maxConsecutiveDays,seasonalRestrictions,requireManagerComments\n'
    csvContent += 'Annual Leave,Paid time off for vacation,20,5,YES,1.67,3,YES,MANAGER_THEN_HR,14,NO,YES,15,"12,1",YES\n'
    csvContent += '\n\n'
    
    csvContent += 'LEAVE TYPES\n'
    csvContent += 'policyName*,typeName*,code*,description,color,isActive\n'
    csvContent += 'Annual Leave,Vacation Leave,VL,Regular vacation time off,#3B82F6,YES\n'
    csvContent += '\n\n'
    
    csvContent += 'PUBLIC HOLIDAYS\n'
    csvContent += 'holidayName*,dateOrPattern*,description,isRecurring,country,state\n'
    csvContent += 'New Year\'s Day,01-01,Celebration of new year,YES,NG,All\n'
    csvContent += '\n\n'
    
    csvContent += 'BLACKOUT PERIODS\n'
    csvContent += 'periodName*,startDate*,endDate*,reason,appliesToAllLeaveTypes,policyName\n'
    csvContent += `Year-End Shutdown,${new Date().getFullYear()}-12-20,${new Date().getFullYear()}-12-31,Company-wide holiday shutdown,YES,\n`
    
    const response = new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leave-template-${company.companyName.replace(/[^a-zA-Z0-9]/g, '_')}.csv"`,
        'Cache-Control': 'no-cache',
      },
    })
    
    return withCors(response, origin)
  } else {
    const buffer = await workbook.xlsx.writeBuffer()

    const response = new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leave-template-${company.companyName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx"`,
        'Cache-Control': 'no-cache',
      },
    })
    
    return withCors(response, origin)
  }
}

// Process leave upload data
async function processLeaveUpload(companyId: string, file: File, userId: string, fileName: string, filePath: string) {
  const { prisma } = await import('@/app/lib/prisma')
  
  // Create initial upload record
  const leaveUpload = await prisma.leaveUpload.create({
    data: {
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
      blackoutPeriodsUpdated: 0
    }
  })

  // Process results object
  const results = {
    policies: { 
      created: 0, 
      updated: 0, 
      failed: 0, 
      errors: [] as string[], 
      failedRecords: [] as FailedRecord[] 
    },
    leaveTypes: { 
      created: 0, 
      updated: 0, 
      failed: 0, 
      errors: [] as string[], 
      failedRecords: [] as FailedRecord[] 
    },
    holidays: { 
      created: 0, 
      updated: 0, 
      failed: 0, 
      errors: [] as string[], 
      failedRecords: [] as FailedRecord[] 
    },
    blackoutPeriods: { 
      created: 0, 
      updated: 0, 
      failed: 0, 
      errors: [] as string[], 
      failedRecords: [] as FailedRecord[] 
    }
  }

  let workbook: ExcelJS.Workbook | null = null
  
  try {
    // Read and parse file
    const bytes = await file.arrayBuffer()
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || ''
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    
    if (isCsv) {
      // Parse CSV using manual parsing to avoid ExcelJS compatibility issues
      const csvText = new TextDecoder().decode(bytes)
      workbook = await parseCSVToWorkbook(csvText)
    } else {
      // Parse Excel
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
          'policyName',
          'description',
          'maxDays',
          'carryOver',
          'isPaid',
          'accrualRate',
          'minEmploymentMonths',
          'requiresApproval',
          'approvalWorkflow',
          'noticePeriod',
          'documentationRequired',
          'allowHalfDays',
          'maxConsecutiveDays',
          'seasonalRestrictions',
          'requireManagerComments'
        ])

        for (let i = 0; i < policiesData.length; i++) {
          const rowNumber = i + 2
          const policyData = policiesData[i]
          
          try {
            // Validate required fields
            if (!policyData.policyName || !policyData.maxDays || !policyData.approvalWorkflow) {
              throw new Error('Missing required fields (policyName, maxDays, approvalWorkflow)')
            }

            // Validate approvalWorkflow
            const validWorkflows = ['MANAGER_THEN_HR', 'MANAGER_ONLY', 'HR_ONLY', 'NONE']
            if (!validWorkflows.includes(policyData.approvalWorkflow)) {
              throw new Error(`Invalid approvalWorkflow. Must be one of: ${validWorkflows.join(', ')}`)
            }

            // Convert boolean strings
            const isPaid = policyData.isPaid?.toUpperCase() === 'YES'
            const requiresApproval = policyData.requiresApproval?.toUpperCase() === 'YES'
            const documentationRequired = policyData.documentationRequired?.toUpperCase() === 'YES'
            const allowHalfDays = policyData.allowHalfDays?.toUpperCase() !== 'NO' // Default: true
            const requireManagerComments = policyData.requireManagerComments?.toUpperCase() === 'YES'

            // Validate numeric fields
            const maxDays = parseInt(policyData.maxDays)
            if (isNaN(maxDays) || maxDays <= 0) {
              throw new Error('maxDays must be a positive number')
            }

            const carryOver = policyData.carryOver ? parseInt(policyData.carryOver) : 0
            const minEmploymentMonths = policyData.minEmploymentMonths ? parseInt(policyData.minEmploymentMonths) : 0
            const noticePeriod = policyData.noticePeriod ? parseInt(policyData.noticePeriod) : 0
            const accrualRate = policyData.accrualRate ? parseFloat(policyData.accrualRate) : null
            const maxConsecutiveDays = policyData.maxConsecutiveDays ? parseInt(policyData.maxConsecutiveDays) : null

            // Validate seasonal restrictions format
            let seasonalRestrictions = null
            if (policyData.seasonalRestrictions) {
              const months = policyData.seasonalRestrictions.split(',').map((m: string) => parseInt(m.trim()))
              if (months.some((m: number) => isNaN(m) || m < 1 || m > 12)) {
                throw new Error('seasonalRestrictions must be comma-separated months (1-12)')
              }
              seasonalRestrictions = months.join(',')
            }

            // Check if policy exists
            const existingPolicy = await prisma.leavePolicy.findFirst({
              where: {
                companyId: companyId,
                name: policyData.policyName
              }
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
              await prisma.leavePolicy.create({
                data: policyDataToSave
              })
              results.policies.created++
            }

          } catch (error: any) {
            results.policies.failed++
            results.policies.errors.push(`Row ${rowNumber}: ${error.message}`)
            
            const suggestion = getPolicyErrorSuggestion(error.message, policyData)
            results.policies.failedRecords.push({
              sheetType: 'POLICIES',
              rowData: policyData,
              error: error.message,
              suggestion
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
        const typesData = parseSheetData(typesSheet, [
          'policyName',
          'typeName',
          'code',
          'description',
          'color',
          'isActive'
        ])

        // Get all policies for this company
        const policies = await prisma.leavePolicy.findMany({
          where: { companyId: companyId }
        })

        const policyMap = new Map(policies.map(p => [p.name, p.id]))

        for (let i = 0; i < typesData.length; i++) {
          const rowNumber = i + 2
          const typeData = typesData[i]
          
          try {
            // Validate required fields
            if (!typeData.policyName || !typeData.typeName || !typeData.code) {
              throw new Error('Missing required fields (policyName, typeName, code)')
            }

            // Get policy ID
            const policyId = policyMap.get(typeData.policyName)
            if (!policyId) {
              throw new Error(`Policy "${typeData.policyName}" not found. Create policy first.`)
            }

            // Validate code format
            const codeRegex = /^[A-Z0-9]{2,4}$/
            if (!codeRegex.test(typeData.code)) {
              throw new Error('Code must be 2-4 uppercase alphanumeric characters')
            }

            const isActive = typeData.isActive?.toUpperCase() !== 'NO' // Default: true

            // Check if leave type exists
            const existingType = await prisma.leaveType.findFirst({
              where: {
                policyId: policyId,
                OR: [
                  { name: typeData.typeName },
                  { code: typeData.code }
                ]
              }
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
              await prisma.leaveType.update({
                where: { id: existingType.id },
                data: typeDataToSave
              })
              results.leaveTypes.updated++
            } else {
              await prisma.leaveType.create({
                data: typeDataToSave
              })
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
        const holidaysData = parseSheetData(holidaysSheet, [
          'holidayName',
          'dateOrPattern',
          'description',
          'isRecurring',
          'country',
          'state'
        ])

        for (let i = 0; i < holidaysData.length; i++) {
          const rowNumber = i + 2
          const holidayData = holidaysData[i]
          
          try {
            // Validate required fields
            if (!holidayData.holidayName || !holidayData.dateOrPattern) {
              throw new Error('Missing required fields (holidayName, dateOrPattern)')
            }

            const isRecurring = holidayData.isRecurring?.toUpperCase() === 'YES'
            let holidayDate: Date

            if (isRecurring) {
              // Parse MM-DD pattern
              const patternMatch = holidayData.dateOrPattern.match(/^(\d{1,2})-(\d{1,2})$/)
              if (!patternMatch) {
                throw new Error('Invalid date pattern for recurring holiday. Use MM-DD format')
              }
              
              const month = parseInt(patternMatch[1]) - 1
              const day = parseInt(patternMatch[2])
              
              if (month < 0 || month > 11 || day < 1 || day > 31) {
                throw new Error('Invalid date values')
              }
              
              // Use current year for recurring holidays
              holidayDate = new Date(new Date().getFullYear(), month, day)
            } else {
              // Parse specific date
              holidayDate = new Date(holidayData.dateOrPattern)
              if (isNaN(holidayDate.getTime())) {
                throw new Error('Invalid date format. Use YYYY-MM-DD for specific dates')
              }
            }

            // Check if holiday exists
            const existingHoliday = await prisma.publicHoliday.findFirst({
              where: {
                companyId: companyId,
                date: holidayDate,
                name: holidayData.holidayName
              }
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
              await prisma.publicHoliday.update({
                where: { id: existingHoliday.id },
                data: holidayDataToSave
              })
              results.holidays.updated++
            } else {
              await prisma.publicHoliday.create({
                data: holidayDataToSave
              })
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
        const blackoutData = parseSheetData(blackoutSheet, [
          'periodName',
          'startDate',
          'endDate',
          'reason',
          'appliesToAllLeaveTypes',
          'policyName'
        ])

        // Get all policies for mapping
        const policies = await prisma.leavePolicy.findMany({
          where: { companyId: companyId }
        })
        const policyMap = new Map(policies.map(p => [p.name, p.id]))

        for (let i = 0; i < blackoutData.length; i++) {
          const rowNumber = i + 2
          const periodData = blackoutData[i]
          
          try {
            // Validate required fields
            if (!periodData.periodName || !periodData.startDate || !periodData.endDate) {
              throw new Error('Missing required fields (periodName, startDate, endDate)')
            }

            // Parse dates
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

            // Check if blackout period exists
            const existingPeriod = await prisma.leaveBlackoutPeriod.findFirst({
              where: {
                companyId: companyId,
                name: periodData.periodName,
                startDate: startDate,
                endDate: endDate
              }
            })

            const periodDataToSave = {
              companyId: companyId,
              name: periodData.periodName,
              startDate: startDate,
              endDate: endDate,
              reason: periodData.reason || null,
              appliesToAllLeaveTypes: appliesToAllLeaveTypes,
              policyId: policyId
            }

            if (existingPeriod) {
              await prisma.leaveBlackoutPeriod.update({
                where: { id: existingPeriod.id },
                data: periodDataToSave
              })
              results.blackoutPeriods.updated++
            } else {
              await prisma.leaveBlackoutPeriod.create({
                data: periodDataToSave
              })
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

  // Update upload record with final results
  const updatedUpload = await prisma.leaveUpload.update({
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
      failedRecords: allFailedRecords.length > 0 ? JSON.stringify(allFailedRecords) : null
    }
  })

  return {
    upload: updatedUpload,
    results,
    hasFailedRecords: allFailedRecords.length > 0,
    totalFailed: results.policies.failed + results.leaveTypes.failed + results.holidays.failed + results.blackoutPeriods.failed
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
      const { prisma } = await import('@/app/lib/prisma')
      
      // Verify upload exists and user has access
      const upload = await prisma.leaveUpload.findFirst({
        where: {
          id: uploadId,
          uploadedBy: user.userId
        }
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

      // Parse failed records
      let failedRecords: FailedRecord[] = []
      try {
        failedRecords = JSON.parse(upload.failedRecords as string)
      } catch {
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

    // Verify company exists
    const { prisma } = await import('@/app/lib/prisma')
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

    // Check user access based on role
    let hasAccess = false
    
    if (user.role === 'SUPER_ADMIN') {
      hasAccess = true
    } else if (user.role === 'HR') {
      hasAccess = user.companyId === companyId
    } else if (user.role === 'ADMIN') {
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId,
          role: { in: ['ADMIN', 'ALL'] }
        }
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
      { 
        success: false, 
        message: 'Failed to process request',
        details: error.message 
      },
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

    // Verify company exists
    const { prisma } = await import('@/app/lib/prisma')
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        archived: 0
      }
    })

    if (!company) {
      const response = NextResponse.json(
        { success: false, message: 'Company not found or is archived' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    // Check user access based on role
    let hasAccess = false
    
    if (user.role === 'SUPER_ADMIN') {
      hasAccess = true
    } else if (user.role === 'HR') {
      hasAccess = user.companyId === companyId
    } else if (user.role === 'ADMIN') {
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId,
          role: { in: ['ADMIN', 'ALL'] }
        }
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

    // Validate file type
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

    // Save file locally
    const { uploadsDir, leavesDir } = await ensureUploadDirectories()
    const fileName = `leave-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const savedFilePath = path.join(leavesDir, fileName)
    const relativeFilePath = getRelativePath(savedFilePath)

    // Save the original file
    const bytes = await file.arrayBuffer()
    await writeFile(savedFilePath, Buffer.from(bytes))

    // Process the upload
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
        details: {
          policies: processResult.results.policies,
          leaveTypes: processResult.results.leaveTypes,
          holidays: processResult.results.holidays,
          blackoutPeriods: processResult.results.blackoutPeriods
        }
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Error in POST /api/leaves/upload:', error)
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to process leave upload',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}

// Helper function to download failed records
async function downloadFailedRecords(
  upload: any, 
  failedRecords: FailedRecord[], 
  format: string, 
  origin: string | null
) {
  const workbook = new ExcelJS.Workbook()
  
  // Group failed records by sheet type
  const policiesRecords = failedRecords.filter(r => r.sheetType === 'POLICIES')
  const leaveTypesRecords = failedRecords.filter(r => r.sheetType === 'LEAVE_TYPES')
  const holidaysRecords = failedRecords.filter(r => r.sheetType === 'HOLIDAYS')
  const blackoutRecords = failedRecords.filter(r => r.sheetType === 'BLACKOUT_PERIODS')

  // Policies sheet
  if (policiesRecords.length > 0) {
    const policiesSheet = workbook.addWorksheet('Failed Policies')
    policiesSheet.addRow(['FAILED POLICIES - Correct and re-upload'])
    policiesSheet.addRow(['Original upload date:', new Date(upload.createdAt).toISOString()])
    policiesSheet.addRow(['Company:', upload.companyId])
    policiesSheet.addRow([''])
    
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
      { header: 'ERROR', key: 'error', width: 50 },
      { header: 'SUGGESTION', key: 'suggestion', width: 50 }
    ]
    
    const policyHeaderRow = policiesSheet.getRow(5)
    policyHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    policyHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    policyHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
    
    policiesRecords.forEach(record => {
      policiesSheet.addRow({
        ...record.rowData,
        error: record.error,
        suggestion: record.suggestion || ''
      })
    })
  }

  // Leave Types sheet
  if (leaveTypesRecords.length > 0) {
    const typesSheet = workbook.addWorksheet('Failed Leave Types')
    typesSheet.addRow(['FAILED LEAVE TYPES - Correct and re-upload'])
    typesSheet.addRow(['Original upload date:', new Date(upload.createdAt).toISOString()])
    typesSheet.addRow(['Company:', upload.companyId])
    typesSheet.addRow([''])
    
    typesSheet.columns = [
      { header: 'policyName', key: 'policyName', width: 20 },
      { header: 'typeName', key: 'typeName', width: 20 },
      { header: 'code', key: 'code', width: 10 },
      { header: 'description', key: 'description', width: 30 },
      { header: 'color', key: 'color', width: 15 },
      { header: 'isActive', key: 'isActive', width: 10 },
      { header: 'ERROR', key: 'error', width: 50 }
    ]
    
    const typeHeaderRow = typesSheet.getRow(5)
    typeHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    typeHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    typeHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
    
    leaveTypesRecords.forEach(record => {
      typesSheet.addRow({
        ...record.rowData,
        error: record.error
      })
    })
  }

  // Holidays sheet
  if (holidaysRecords.length > 0) {
    const holidaysSheet = workbook.addWorksheet('Failed Holidays')
    holidaysSheet.addRow(['FAILED HOLIDAYS - Correct and re-upload'])
    holidaysSheet.addRow(['Original upload date:', new Date(upload.createdAt).toISOString()])
    holidaysSheet.addRow(['Company:', upload.companyId])
    holidaysSheet.addRow([''])
    
    holidaysSheet.columns = [
      { header: 'holidayName', key: 'holidayName', width: 25 },
      { header: 'dateOrPattern', key: 'dateOrPattern', width: 20 },
      { header: 'description', key: 'description', width: 30 },
      { header: 'isRecurring', key: 'isRecurring', width: 15 },
      { header: 'country', key: 'country', width: 15 },
      { header: 'state', key: 'state', width: 15 },
      { header: 'ERROR', key: 'error', width: 50 }
    ]
    
    const holidayHeaderRow = holidaysSheet.getRow(5)
    holidayHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    holidayHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    holidayHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
    
    holidaysRecords.forEach(record => {
      holidaysSheet.addRow({
        ...record.rowData,
        error: record.error
      })
    })
  }

  // Blackout Periods sheet
  if (blackoutRecords.length > 0) {
    const blackoutSheet = workbook.addWorksheet('Failed Blackout Periods')
    blackoutSheet.addRow(['FAILED BLACKOUT PERIODS - Correct and re-upload'])
    blackoutSheet.addRow(['Original upload date:', new Date(upload.createdAt).toISOString()])
    blackoutSheet.addRow(['Company:', upload.companyId])
    blackoutSheet.addRow([''])
    
    blackoutSheet.columns = [
      { header: 'periodName', key: 'periodName', width: 25 },
      { header: 'startDate', key: 'startDate', width: 15 },
      { header: 'endDate', key: 'endDate', width: 15 },
      { header: 'reason', key: 'reason', width: 30 },
      { header: 'appliesToAllLeaveTypes', key: 'appliesToAllLeaveTypes', width: 25 },
      { header: 'policyName', key: 'policyName', width: 20 },
      { header: 'ERROR', key: 'error', width: 50 }
    ]
    
    const blackoutHeaderRow = blackoutSheet.getRow(5)
    blackoutHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    blackoutHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    blackoutHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }
    
    blackoutRecords.forEach(record => {
      blackoutSheet.addRow({
        ...record.rowData,
        error: record.error
      })
    })
  }

  // Style all sheets with alternating row colors
  workbook.eachWorksheet((worksheet) => {
    const dataStartRow = 5
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber >= dataStartRow) {
        row.alignment = { vertical: 'middle', horizontal: 'left' }
        row.font = { size: 11 }
        if ((rowNumber - dataStartRow) % 2 === 0) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
        }
      }
    })
  })

  if (format === 'csv') {
    // Create CSV for all failed records
    let csvContent = ''
    
    // Policies
    if (policiesRecords.length > 0) {
      csvContent += 'FAILED POLICIES\n'
      csvContent += 'policyName,description,maxDays,carryOver,isPaid,accrualRate,minEmploymentMonths,requiresApproval,approvalWorkflow,noticePeriod,documentationRequired,allowHalfDays,maxConsecutiveDays,seasonalRestrictions,requireManagerComments,ERROR,SUGGESTION\n'
      policiesRecords.forEach(record => {
        const row = [
          record.rowData.policyName || '',
          record.rowData.description || '',
          record.rowData.maxDays || '',
          record.rowData.carryOver || '',
          record.rowData.isPaid || '',
          record.rowData.accrualRate || '',
          record.rowData.minEmploymentMonths || '',
          record.rowData.requiresApproval || '',
          record.rowData.approvalWorkflow || '',
          record.rowData.noticePeriod || '',
          record.rowData.documentationRequired || '',
          record.rowData.allowHalfDays || '',
          record.rowData.maxConsecutiveDays || '',
          record.rowData.seasonalRestrictions || '',
          record.rowData.requireManagerComments || '',
          record.error,
          record.suggestion || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
      csvContent += '\n\n'
    }
    
    // Leave Types
    if (leaveTypesRecords.length > 0) {
      csvContent += 'FAILED LEAVE TYPES\n'
      csvContent += 'policyName,typeName,code,description,color,isActive,ERROR\n'
      leaveTypesRecords.forEach(record => {
        const row = [
          record.rowData.policyName || '',
          record.rowData.typeName || '',
          record.rowData.code || '',
          record.rowData.description || '',
          record.rowData.color || '',
          record.rowData.isActive || '',
          record.error
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
      csvContent += '\n\n'
    }
    
    // Holidays
    if (holidaysRecords.length > 0) {
      csvContent += 'FAILED HOLIDAYS\n'
      csvContent += 'holidayName,dateOrPattern,description,isRecurring,country,state,ERROR\n'
      holidaysRecords.forEach(record => {
        const row = [
          record.rowData.holidayName || '',
          record.rowData.dateOrPattern || '',
          record.rowData.description || '',
          record.rowData.isRecurring || '',
          record.rowData.country || '',
          record.rowData.state || '',
          record.error
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
      csvContent += '\n\n'
    }
    
    // Blackout Periods
    if (blackoutRecords.length > 0) {
      csvContent += 'FAILED BLACKOUT PERIODS\n'
      csvContent += 'periodName,startDate,endDate,reason,appliesToAllLeaveTypes,policyName,ERROR\n'
      blackoutRecords.forEach(record => {
        const row = [
          record.rowData.periodName || '',
          record.rowData.startDate || '',
          record.rowData.endDate || '',
          record.rowData.reason || '',
          record.rowData.appliesToAllLeaveTypes || '',
          record.rowData.policyName || '',
          record.error
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
        csvContent += row + '\n'
      })
    }
    
    const response = new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="failed-records-${upload.id}.csv"`,
        'Cache-Control': 'no-cache',
      },
    })
    
    return withCors(response, origin)
  } else {
    const buffer = await workbook.xlsx.writeBuffer()

    const response = new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="failed-records-${upload.id}.xlsx"`,
        'Cache-Control': 'no-cache',
      },
    })
    
    return withCors(response, origin)
  }
}