// src/app/api/leaves/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'

import { requireModuleAccess } from '@/app/lib/module-access'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { randomUUID } from 'crypto'
import { LEAVE_TYPE_COLUMNS, LEAVE_POLICY_COLUMNS, autoLeaveTypeColor, deriveLeaveCode, normalizeDocTiming, getRelativePath } from '@/app/lib/leave/upload-columns'
import { publicErrorMessage } from '@/app/lib/errors/public-error'
import { forCompany } from '@/app/lib/data/tenant'
import { FailedRecord, parseSheetData, parseCSVToWorkbook, downloadTemplate, downloadFailedRecords } from '@/app/lib/leave/upload-files'
import { uploadFileToS3 } from '@/app/lib/storage/upload-files'

// Define types for failed records


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


// Manual CSV parsing function


// Generate error suggestions
function getPolicyErrorSuggestion(error: string, _policyData: any): string {
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
        const policies = await forCompany(companyId).leavePolicy.findMany()
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

            const existingPolicy = await forCompany(companyId).leavePolicy.findFirst({
              where: { name: policyName }
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
      } catch (_e) {
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
      const userCompany = await forCompany(companyId).userCompany.findFirst({
        where: { userId: user.userId, role: { in: ['ADMIN', 'ALL'] } }
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
        forCompany(companyId).leave_uploads.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        forCompany(companyId).leave_uploads.count(),
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
      { success: false, message: 'Failed to process request', details: publicErrorMessage(error) },
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
      const userCompany = await forCompany(companyId).userCompany.findFirst({
        where: { userId: user.userId, role: { in: ['ADMIN', 'ALL'] } }
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

    const { leavesDir } = await ensureUploadDirectories()
    const fileName = `leave-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const savedFilePath = path.join(leavesDir, fileName)
    const relativeFilePath = getRelativePath(savedFilePath)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(savedFilePath, buffer)
    await uploadFileToS3(relativeFilePath, buffer)

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
      { success: false, message: 'Failed to process leave upload', details: error instanceof Error ? publicErrorMessage(error) : 'Unknown error' },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}