// src/app/api/leaves/upload/[id]/failed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import ExcelJS from 'exceljs'

// Define the type for failed records based on your JSON structure
interface FailedRecord {
  sheetType: 'POLICIES' | 'LEAVE_TYPES' | 'HOLIDAYS' | 'BLACKOUT_PERIODS'
  rowData: string
  error: string
  suggestion?: string
}

// -----------------------------
// OPTIONS - CORS preflight
// -----------------------------
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// -----------------------------
// GET - Download failed records for a specific upload
// -----------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id: uploadId } = params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'excel'

    // Get the upload record - NO INCLUDE NEEDED
    const { prisma } = await import('@/app/lib/prisma')
    const upload = await prisma.leaveUpload.findFirst({
      where: {
        id: uploadId,
        uploadedBy: user.userId // Users can only download their own failed records
      }
      // REMOVED: include: { failedRecords: ... } - because failedRecords is JSON, not a relation
    })
    
    if (!upload) {
      const response = NextResponse.json(
        { success: false, message: 'Upload not found or you do not have access' },
        { status: 404 }
      )
      return withCors(response, origin)
    }
    
    // Parse the failedRecords JSON field from the upload record
    let failedRecords: FailedRecord[] = []
    
    // Check if failedRecords exists and is not null
    if (upload.failedRecords) {
      try {
        // Parse the JSON string stored in the failedRecords field
        failedRecords = JSON.parse(String(upload.failedRecords))
      } catch (error) {
        console.error('Failed to parse failedRecords JSON:', error)
        const response = NextResponse.json(
          { success: false, message: 'Failed to parse failed records data' },
          { status: 500 }
        )
        return withCors(response, origin)
      }
    }
    
    if (failedRecords.length === 0) {
      const response = NextResponse.json(
        { success: false, message: 'No failed records found for this upload' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    const workbook = new ExcelJS.Workbook()
    
    // Group failed records by sheet type
    const policiesRecords = failedRecords.filter(r => r.sheetType === 'POLICIES')
    const leaveTypesRecords = failedRecords.filter(r => r.sheetType === 'LEAVE_TYPES')
    const holidaysRecords = failedRecords.filter(r => r.sheetType === 'HOLIDAYS')
    const blackoutRecords = failedRecords.filter(r => r.sheetType === 'BLACKOUT_PERIODS')

    // Helper function to parse JSON row data
    function parseRowData(rowData: string): any {
      try {
        return JSON.parse(rowData)
      } catch {
        return {}
      }
    }

    // Policies sheet
    if (policiesRecords.length > 0) {
      const policiesSheet = workbook.addWorksheet('Failed Policies')
      policiesSheet.addRow(['FAILED POLICIES - Correct and re-upload'])
      policiesSheet.addRow(['Original upload date:', upload.createdAt.toISOString()])
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
        const rowData = parseRowData(record.rowData)
        policiesSheet.addRow({
          ...rowData,
          error: record.error,
          suggestion: record.suggestion || ''
        })
      })
    }

    // Leave Types sheet
    if (leaveTypesRecords.length > 0) {
      const typesSheet = workbook.addWorksheet('Failed Leave Types')
      typesSheet.addRow(['FAILED LEAVE TYPES - Correct and re-upload'])
      typesSheet.addRow(['Original upload date:', upload.createdAt.toISOString()])
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
        const rowData = parseRowData(record.rowData)
        typesSheet.addRow({
          ...rowData,
          error: record.error
        })
      })
    }

    // Holidays sheet
    if (holidaysRecords.length > 0) {
      const holidaysSheet = workbook.addWorksheet('Failed Holidays')
      holidaysSheet.addRow(['FAILED HOLIDAYS - Correct and re-upload'])
      holidaysSheet.addRow(['Original upload date:', upload.createdAt.toISOString()])
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
        const rowData = parseRowData(record.rowData)
        holidaysSheet.addRow({
          ...rowData,
          error: record.error
        })
      })
    }

    // Blackout Periods sheet
    if (blackoutRecords.length > 0) {
      const blackoutSheet = workbook.addWorksheet('Failed Blackout Periods')
      blackoutSheet.addRow(['FAILED BLACKOUT PERIODS - Correct and re-upload'])
      blackoutSheet.addRow(['Original upload date:', upload.createdAt.toISOString()])
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
        const rowData = parseRowData(record.rowData)
        blackoutSheet.addRow({
          ...rowData,
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
          const rowData = parseRowData(record.rowData)
          const row = [
            rowData.policyName || '',
            rowData.description || '',
            rowData.maxDays || '',
            rowData.carryOver || '',
            rowData.isPaid || '',
            rowData.accrualRate || '',
            rowData.minEmploymentMonths || '',
            rowData.requiresApproval || '',
            rowData.approvalWorkflow || '',
            rowData.noticePeriod || '',
            rowData.documentationRequired || '',
            rowData.allowHalfDays || '',
            rowData.maxConsecutiveDays || '',
            rowData.seasonalRestrictions || '',
            rowData.requireManagerComments || '',
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
          const rowData = parseRowData(record.rowData)
          const row = [
            rowData.policyName || '',
            rowData.typeName || '',
            rowData.code || '',
            rowData.description || '',
            rowData.color || '',
            rowData.isActive || '',
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
          const rowData = parseRowData(record.rowData)
          const row = [
            rowData.holidayName || '',
            rowData.dateOrPattern || '',
            rowData.description || '',
            rowData.isRecurring || '',
            rowData.country || '',
            rowData.state || '',
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
          const rowData = parseRowData(record.rowData)
          const row = [
            rowData.periodName || '',
            rowData.startDate || '',
            rowData.endDate || '',
            rowData.reason || '',
            rowData.appliesToAllLeaveTypes || '',
            rowData.policyName || '',
            record.error
          ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
          csvContent += row + '\n'
        })
      }
      
      const response = new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="failed-records-${uploadId}.csv"`,
          'Cache-Control': 'no-cache',
        },
      })
      
      return withCors(response, origin)
    } else {
      const buffer = await workbook.xlsx.writeBuffer()

      const response = new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="failed-records-${uploadId}.xlsx"`,
          'Cache-Control': 'no-cache',
        },
      })
      
      return withCors(response, origin)
    }

  } catch (error) {
    console.error('Error in GET /api/leaves/upload/[id]/failed:', error)
    const response = NextResponse.json(
      { success: false, message: 'Failed to download failed records' },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}