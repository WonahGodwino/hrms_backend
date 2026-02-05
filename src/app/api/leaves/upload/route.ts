// src/app/api/leaves/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

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

function splitCsvLine(line: string) {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"'
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  result.push(cur)
  return result.map((s) => s.trim())
}

function normalizeHeader(h: string) {
  return h
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
    
    // Skip empty rows
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

// Interfaces
interface FailedRecord {
  sheet: 'policies' | 'leaveTypes' | 'holidays' | 'blackoutPeriods'
  rowData: any
  error: string
  rowNumber: number
  suggestion?: string
}

interface UploadSession {
  id: string
  failedRecords: FailedRecord[]
  originalData: {
    policies: any[]
    leaveTypes: any[]
    holidays: any[]
    blackoutPeriods: any[]
  }
  companyId: string
  uploadedBy: string
  createdAt: Date
}

// Store upload sessions in memory with expiration
const uploadSessions = new Map<string, UploadSession>()

// Clean up expired sessions every hour
setInterval(() => {
  const now = new Date()
  for (const [sessionId, session] of uploadSessions.entries()) {
    const sessionAge = now.getTime() - session.createdAt.getTime()
    if (sessionAge > 24 * 60 * 60 * 1000) { // 24 hours
      uploadSessions.delete(sessionId)
    }
  }
}, 60 * 60 * 1000)

// -----------------------------
// OPTIONS - CORS preflight
// -----------------------------
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  })
}

// -----------------------------
// GET - Download Template or Failed Records
// -----------------------------
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const action = searchParams.get('action')
    const sessionId = searchParams.get('sessionId')
    const format = searchParams.get('format') || 'excel'

    // Handle failed records download
    if (action === 'failed' && sessionId) {
      return await downloadFailedRecords(sessionId, format, session.user.id)
    }

    // Template download
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    // Verify company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId, archived: 0 }
    })

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found or is archived' },
        { status: 404 }
      )
    }

    // Check user access
    const userCompanies = await prisma.userCompany.findMany({
      where: { userId: session.user.id }
    })

    const userRecord = await prisma.staffRecord.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    })

    const isSuperAdmin = userRecord?.role === 'SUPER_ADMIN'
    const isHRAdmin = userCompanies.some(uc => ['HR', 'ADMIN'].includes(uc.role))
    
    if (!isSuperAdmin && !isHRAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to download templates' },
        { status: 403 }
      )
    }

    // Check company access for HR/ADMIN
    if (isHRAdmin && !isSuperAdmin) {
      const hasAccess = userCompanies.some(uc => uc.companyId === companyId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'You do not have access to this company' },
          { status: 403 }
        )
      }
    }

    if (action === 'template') {
      return await downloadTemplate(company, format)
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Error in GET /api/leaves/upload:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

// -----------------------------
// POST - Upload and Process Leave Management Data
// -----------------------------
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const companyId = formData.get('companyId') as string
    const sessionId = formData.get('sessionId') as string

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    // Verify company exists
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        archived: 0
      }
    })

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found or is archived' },
        { status: 404 }
      )
    }

    // Check user access
    const userCompanies = await prisma.userCompany.findMany({
      where: { userId: session.user.id }
    })

    const userRecord = await prisma.staffRecord.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    })

    const isSuperAdmin = userRecord?.role === 'SUPER_ADMIN'
    const isHRAdmin = userCompanies.some(uc => ['HR', 'ADMIN'].includes(uc.role))
    
    if (!isSuperAdmin && !isHRAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to upload leave data' },
        { status: 403 }
      )
    }

    // Check company access for HR/ADMIN
    if (isHRAdmin && !isSuperAdmin) {
      const hasAccess = userCompanies.some(uc => uc.companyId === companyId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'You do not have access to this company' },
          { status: 403 }
        )
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    const isExcel = ['xlsx', 'xls'].includes(fileExtension || '')

    if (!isCsv && !isExcel) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload Excel (.xlsx, .xls) or CSV files.' },
        { status: 400 }
      )
    }

    // Read and parse file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const workbook = new ExcelJS.Workbook()
    
    if (isCsv) {
      // Parse CSV
      const csvText = new TextDecoder().decode(bytes)
      await workbook.csv.read(Buffer.from(csvText))
    } else {
      // Parse Excel
      await workbook.xlsx.load(bytes)
    }

    const results = {
      policies: { created: 0, updated: 0, failed: 0, errors: [] as string[], failedRecords: [] as FailedRecord[] },
      leaveTypes: { created: 0, updated: 0, failed: 0, errors: [] as string[], failedRecords: [] as FailedRecord[] },
      holidays: { created: 0, updated: 0, failed: 0, errors: [] as string[], failedRecords: [] as FailedRecord[] },
      blackoutPeriods: { created: 0, updated: 0, failed: 0, errors: [] as string[], failedRecords: [] as FailedRecord[] }
    }

    const originalData = {
      policies: [] as any[],
      leaveTypes: [] as any[],
      holidays: [] as any[],
      blackoutPeriods: [] as any[]
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

        originalData.policies = policiesData

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
              const months = policyData.seasonalRestrictions.split(',').map(m => parseInt(m.trim()))
              if (months.some(m => isNaN(m) || m < 1 || m > 12)) {
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
            results.policies.failedRecords.push({
              sheet: 'policies',
              rowData: policyData,
              error: error.message,
              rowNumber: rowNumber,
              suggestion: getPolicyErrorSuggestion(error.message, policyData)
            })
          }
        }
      }
    } catch (error: any) {
      results.policies.failed++
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

        originalData.leaveTypes = typesData

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
              sheet: 'leaveTypes',
              rowData: typeData,
              error: error.message,
              rowNumber: rowNumber
            })
          }
        }
      }
    } catch (error: any) {
      results.leaveTypes.failed++
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

        originalData.holidays = holidaysData

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
              sheet: 'holidays',
              rowData: holidayData,
              error: error.message,
              rowNumber: rowNumber
            })
          }
        }
      }
    } catch (error: any) {
      results.holidays.failed++
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

        originalData.blackoutPeriods = blackoutData

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
              sheet: 'blackoutPeriods',
              rowData: periodData,
              error: error.message,
              rowNumber: rowNumber
            })
          }
        }
      }
    } catch (error: any) {
      results.blackoutPeriods.failed++
      results.blackoutPeriods.errors.push(`Error processing blackout periods sheet: ${error.message}`)
    }

    // Create upload session for failed records
    const uploadSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const uploadSession: UploadSession = {
      id: uploadSessionId,
      failedRecords: [
        ...results.policies.failedRecords,
        ...results.leaveTypes.failedRecords,
        ...results.holidays.failedRecords,
        ...results.blackoutPeriods.failedRecords
      ],
      originalData,
      companyId,
      uploadedBy: session.user.id,
      createdAt: new Date()
    }
    
    uploadSessions.set(uploadSessionId, uploadSession)

    // Save upload record
    const { uploadsDir } = await ensureUploadDirectories()
    const leavesDir = path.join(uploadsDir, 'leaves')
    await mkdir(leavesDir, { recursive: true })

    const fileName = `leave-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const savedFilePath = path.join(leavesDir, fileName)
    const relativeFilePath = getRelativePath(savedFilePath)

    // Save the original file
    await writeFile(savedFilePath, buffer)

    // Create upload record in database
    const leaveUpload = await prisma.leaveUpload.create({
      data: {
        companyId: companyId,
        fileName: file.name,
        filePath: relativeFilePath,
        policiesCreated: results.policies.created + results.policies.updated,
        policiesFailed: results.policies.failed,
        leaveTypesCreated: results.leaveTypes.created + results.leaveTypes.updated,
        leaveTypesFailed: results.leaveTypes.failed,
        holidaysCreated: results.holidays.created + results.holidays.updated,
        holidaysFailed: results.holidays.failed,
        blackoutPeriodsCreated: results.blackoutPeriods.created + results.blackoutPeriods.updated,
        blackoutPeriodsFailed: results.blackoutPeriods.failed,
        errors: [
          ...results.policies.errors,
          ...results.leaveTypes.errors,
          ...results.holidays.errors,
          ...results.blackoutPeriods.errors
        ],
        uploadedBy: session.user.id,
        sessionId: uploadSessionId
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Leave management data processing completed',
      data: {
        summary: {
          companyId: companyId,
          companyName: company.companyName,
          totalProcessed: {
            policies: originalData.policies.length,
            leaveTypes: originalData.leaveTypes.length,
            holidays: originalData.holidays.length,
            blackoutPeriods: originalData.blackoutPeriods.length
          },
          successful: {
            policies: results.policies.created + results.policies.updated,
            leaveTypes: results.leaveTypes.created + results.leaveTypes.updated,
            holidays: results.holidays.created + results.holidays.updated,
            blackoutPeriods: results.blackoutPeriods.created + results.blackoutPeriods.updated
          },
          failed: {
            policies: results.policies.failed,
            leaveTypes: results.leaveTypes.failed,
            holidays: results.holidays.failed,
            blackoutPeriods: results.blackoutPeriods.failed
          },
          hasFailedRecords: results.policies.failed > 0 || results.leaveTypes.failed > 0 || 
                           results.holidays.failed > 0 || results.blackoutPeriods.failed > 0,
          sessionId: uploadSessionId,
          downloadFailedUrl: `/api/leaves/upload?action=failed&sessionId=${uploadSessionId}&format=excel`
        },
        details: {
          policies: results.policies,
          leaveTypes: results.leaveTypes,
          holidays: results.holidays,
          blackoutPeriods: results.blackoutPeriods
        }
      }
    })

  } catch (error) {
    console.error('Error in POST /api/leaves/upload:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process leave upload',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// ============ HELPER FUNCTIONS ============

async function downloadTemplate(company: any, format: string) {
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
  
  if (format === 'csv') {
    // Create CSV for all sheets
    let csvContent = ''
    
    csvContent += 'LEAVE POLICIES\n'
    csvContent += 'policyName*,description,maxDays*,carryOver,isPaid,accrualRate,minEmploymentMonths,requiresApproval,approvalWorkflow*,noticePeriod,documentationRequired,allowHalfDays,maxConsecutiveDays,seasonalRestrictions,requireManagerComments\n'
    csvContent += '\n\n'
    
    csvContent += 'LEAVE TYPES\n'
    csvContent += 'policyName*,typeName*,code*,description,color,isActive\n'
    csvContent += '\n\n'
    
    csvContent += 'PUBLIC HOLIDAYS\n'
    csvContent += 'holidayName*,dateOrPattern*,description,isRecurring,country,state\n'
    csvContent += '\n\n'
    
    csvContent += 'BLACKOUT PERIODS\n'
    csvContent += 'periodName*,startDate*,endDate*,reason,appliesToAllLeaveTypes,policyName\n'
    
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leave-template-${company.companyName}.csv"`,
        'Cache-Control': 'no-cache',
      },
    })
  } else {
    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leave-template-${company.companyName}.xlsx"`,
        'Cache-Control': 'no-cache',
      },
    })
  }
}

async function downloadFailedRecords(sessionId: string, format: string, userId: string) {
  const session = uploadSessions.get(sessionId)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Session expired or not found. Please upload again.' },
      { status: 404 }
    )
  }
  
  // Verify user has access to this session
  if (session.uploadedBy !== userId) {
    return NextResponse.json(
      { error: 'You do not have access to this session' },
      { status: 403 }
    )
  }

  const workbook = new ExcelJS.Workbook()
  
  // Group failed records by sheet
  const sheets = {
    policies: session.failedRecords.filter(r => r.sheet === 'policies'),
    leaveTypes: session.failedRecords.filter(r => r.sheet === 'leaveTypes'),
    holidays: session.failedRecords.filter(r => r.sheet === 'holidays'),
    blackoutPeriods: session.failedRecords.filter(r => r.sheet === 'blackoutPeriods')
  }

  // Policies sheet
  if (sheets.policies.length > 0) {
    const policiesSheet = workbook.addWorksheet('Failed Policies')
    policiesSheet.addRow(['FAILED POLICIES - Correct and re-upload'])
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
    
    sheets.policies.forEach(record => {
      policiesSheet.addRow({
        ...record.rowData,
        error: record.error,
        suggestion: record.suggestion || ''
      })
    })
  }

  // Leave Types sheet
  if (sheets.leaveTypes.length > 0) {
    const typesSheet = workbook.addWorksheet('Failed Leave Types')
    typesSheet.addRow(['FAILED LEAVE TYPES - Correct and re-upload'])
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
    
    sheets.leaveTypes.forEach(record => {
      typesSheet.addRow({
        ...record.rowData,
        error: record.error
      })
    })
  }

  // Holidays sheet
  if (sheets.holidays.length > 0) {
    const holidaysSheet = workbook.addWorksheet('Failed Holidays')
    holidaysSheet.addRow(['FAILED HOLIDAYS - Correct and re-upload'])
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
    
    sheets.holidays.forEach(record => {
      holidaysSheet.addRow({
        ...record.rowData,
        error: record.error
      })
    })
  }

  // Blackout Periods sheet
  if (sheets.blackoutPeriods.length > 0) {
    const blackoutSheet = workbook.addWorksheet('Failed Blackout Periods')
    blackoutSheet.addRow(['FAILED BLACKOUT PERIODS - Correct and re-upload'])
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
    
    sheets.blackoutPeriods.forEach(record => {
      blackoutSheet.addRow({
        ...record.rowData,
        error: record.error
      })
    })
  }

  if (format === 'csv') {
    // Create CSV for all failed records
    let csvContent = ''
    
    // Add each sheet's data
    if (sheets.policies.length > 0) {
      csvContent += 'FAILED POLICIES\n'
      csvContent += 'policyName,description,maxDays,carryOver,isPaid,accrualRate,minEmploymentMonths,requiresApproval,approvalWorkflow,noticePeriod,documentationRequired,allowHalfDays,maxConsecutiveDays,seasonalRestrictions,requireManagerComments,ERROR,SUGGESTION\n'
      sheets.policies.forEach(record => {
        const row = Object.values(record.rowData).concat([record.error, record.suggestion || '']).join(',')
        csvContent += row + '\n'
      })
      csvContent += '\n\n'
    }
    
    // Similar for other sheets...
    
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="failed-records-${sessionId}.csv"`,
        'Cache-Control': 'no-cache',
      },
    })
  } else {
    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="failed-records-${sessionId}.xlsx"`,
        'Cache-Control': 'no-cache',
      },
    })
  }
}

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