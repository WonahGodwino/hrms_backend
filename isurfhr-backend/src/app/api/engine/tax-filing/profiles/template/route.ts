// src/app/api/engine/tax-filing/profiles/template/route.ts
// Tax Profile Import Template Download

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import ExcelJS from 'exceljs'
import { getAllStateNames } from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/profiles/template
 * Download the tax profile import template
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    workbook.created = new Date()

    // =============== DATA SHEET ===============
    const dataSheet = workbook.addWorksheet('Tax Profiles')

    // Define columns
    dataSheet.columns = [
      { header: 'Staff ID', key: 'staffId', width: 20 },
      { header: 'State of Residence', key: 'stateOfResidence', width: 25 },
      { header: 'JTB TIN (13 digits)', key: 'jtbTin', width: 20 },
      { header: 'PFA Name', key: 'pfaName', width: 30 },
    ]

    // Style header row
    const headerRow = dataSheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F5496' },
    }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 25

    // Add sample data
    const sampleData = [
      {
        staffId: 'EMP001',
        stateOfResidence: 'Lagos',
        jtbTin: '1234567890123',
        pfaName: 'ARM Pension',
      },
      {
        staffId: 'EMP002',
        stateOfResidence: 'FCT',
        jtbTin: '9876543210123',
        pfaName: 'Stanbic IBTC Pension',
      },
      {
        staffId: 'EMP003',
        stateOfResidence: 'Ogun',
        jtbTin: '',
        pfaName: 'Leadway Pensure',
      },
    ]

    sampleData.forEach(row => dataSheet.addRow(row))

    // Style sample rows
    for (let i = 2; i <= 4; i++) {
      const row = dataSheet.getRow(i)
      row.alignment = { vertical: 'middle', horizontal: 'left' }
      if (i % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        }
      }
    }

    // Add instructions
    dataSheet.addRow([])
    dataSheet.addRow([])
    const instructionRow = dataSheet.rowCount + 1
    dataSheet.getRow(instructionRow).values = ['INSTRUCTIONS:']
    dataSheet.getRow(instructionRow).font = { bold: true, color: { argb: 'FFFF0000' } }

    const instructions = [
      '• Staff ID: Must match exactly the Staff ID in the system (required)',
      '• State of Residence: Must be a valid Nigerian state name (required) - see States sheet for valid names',
      '• JTB TIN: 13-digit Tax Identification Number (optional)',
      '• PFA Name: Pension Fund Administrator name (optional)',
      '',
      '• Delete the sample rows before uploading your data',
      '• Existing profiles will be updated if Staff ID matches',
    ]

    instructions.forEach((text, idx) => {
      const row = dataSheet.getRow(instructionRow + 1 + idx)
      row.values = [text]
      row.font = { italic: true, color: { argb: 'FF666666' }, size: 10 }
    })

    // =============== STATES REFERENCE SHEET ===============
    const statesSheet = workbook.addWorksheet('States')

    statesSheet.columns = [
      { header: 'State Name', key: 'name', width: 25 },
    ]

    // Style header
    const statesHeaderRow = statesSheet.getRow(1)
    statesHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    statesHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F5496' },
    }

    // Add all valid state names
    const stateNames = getAllStateNames()
    stateNames.forEach(name => {
      statesSheet.addRow({ name })
    })

    // Add note
    statesSheet.addRow({})
    statesSheet.addRow({ name: 'Note: Use these exact state names in the "State of Residence" column' })
    statesSheet.getRow(statesSheet.rowCount).font = { italic: true, color: { argb: 'FFFF0000' } }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return as file download
    const response = new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="tax-profile-import-template.xlsx"',
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
