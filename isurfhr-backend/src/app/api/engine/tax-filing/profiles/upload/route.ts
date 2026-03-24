// src/app/api/engine/tax-filing/profiles/upload/route.ts
// Bulk Import Tax Profiles from Excel/CSV

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { importTaxProfiles, TaxProfileImportRow } from '@/app/lib/payroll-engine/tax-filing'

// Helper functions for parsing
function cellToString(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && Array.isArray(value?.richText)) {
    return value.richText.map((t: any) => t?.text || '').join('').trim()
  }
  if (typeof value === 'object' && value?.text) {
    return String(value.text).trim()
  }
  if (typeof value === 'object' && value?.result !== undefined) {
    return String(value.result).trim()
  }
  return String(value).trim()
}

function normalizeHeader(h: string): string {
  return h
    .toString()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function pick(row: any, keys: string[]): any {
  for (const k of keys) {
    if (row?.[k] !== undefined && row?.[k] !== null && row?.[k] !== '') return row[k]
  }
  const normalizedRow: Record<string, any> = {}
  for (const key of Object.keys(row || {})) {
    normalizedRow[normalizeHeader(key)] = row[key]
  }
  for (const k of keys) {
    const nk = normalizeHeader(k)
    if (normalizedRow[nk] !== undefined && normalizedRow[nk] !== null && normalizedRow[nk] !== '')
      return normalizedRow[nk]
  }
  return undefined
}

function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
}

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * POST /api/engine/tax-filing/profiles/upload
 * Bulk import tax profiles from Excel/CSV file
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File

    // Determine company ID
    let companyId: string | null = null

    if (authUser.role === 'HR') {
      companyId = authUser.companyId || null
    } else {
      const selectedCompanyId = formData.get('companyId') as string | null
      if (!selectedCompanyId) {
        return withCors(
          ApiResponse.error('Company ID is required for administrators', 400),
          origin
        )
      }
      companyId = selectedCompanyId
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Validate admin has access
    if (authUser.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: authUser.userId,
          companyId,
          role: { in: ['ADMIN', 'ALL'] },
        },
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have access to this company', 403),
          origin
        )
      }
    }

    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    // Validate file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ]

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    const isExcel = ['xlsx', 'xls'].includes(fileExtension || '')

    if (!allowedTypes.includes(file.type) && !isCsv && !isExcel) {
      return withCors(
        ApiResponse.error('Invalid file type. Please upload Excel or CSV files.', 400),
        origin
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let data: TaxProfileImportRow[] = []

    try {
      const workbook = new ExcelJS.Workbook()

      if (isCsv) {
        // Parse CSV
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter(l => l.trim())
        if (!lines.length) {
          return withCors(ApiResponse.error('Empty CSV file', 400), origin)
        }

        const headers = lines[0].split(',').map(h => h.trim())

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim())
          const rowData: any = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] ?? ''
          })

          const staffId = pick(rowData, ['staffId', 'Staff ID', 'STAFF ID', 'staff_id'])
          const stateOfResidence = pick(rowData, [
            'stateOfResidence', 'State of Residence', 'STATE OF RESIDENCE',
            'state', 'State', 'STATE'
          ])

          if (staffId && stateOfResidence) {
            data.push({
              staffId: cellToString(staffId),
              stateOfResidence: cellToString(stateOfResidence),
              jtbTin: cellToString(pick(rowData, ['jtbTin', 'JTB TIN', 'TIN', 'tin'])),
              pfaName: cellToString(pick(rowData, ['pfaName', 'PFA Name', 'PFA', 'pfa'])),
            })
          }
        }
      } else {
        // Parse Excel
        await workbook.xlsx.load(bytes)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) {
          return withCors(ApiResponse.error('No worksheet found in Excel file', 400), origin)
        }

        const headers: string[] = []
        const headerRow = worksheet.getRow(1)
        headerRow.eachCell((cell, colNumber) => {
          const raw = cellToString(cell.value) || `col${colNumber}`
          headers[colNumber - 1] = raw
        })

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= 1) return

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1] || `col${colNumber}`
            rowData[header] = cellToString(cell.value)
          })

          const staffId = pick(rowData, ['staffId', 'Staff ID', 'STAFF ID', 'staff_id'])
          const stateOfResidence = pick(rowData, [
            'stateOfResidence', 'State of Residence', 'STATE OF RESIDENCE',
            'state', 'State', 'STATE'
          ])

          if (staffId && stateOfResidence) {
            data.push({
              staffId: cellToString(staffId),
              stateOfResidence: cellToString(stateOfResidence),
              jtbTin: cellToString(pick(rowData, ['jtbTin', 'JTB TIN', 'TIN', 'tin', 'JTB TIN (13 digits)'])),
              pfaName: cellToString(pick(rowData, ['pfaName', 'PFA Name', 'PFA', 'pfa'])),
            })
          }
        })
      }
    } catch (parseError) {
      console.error('File parsing error:', parseError)
      return withCors(
        ApiResponse.error('Failed to parse file. Please check the file format.', 400),
        origin
      )
    }

    if (!data.length) {
      return withCors(ApiResponse.error('No valid data found in the file', 400), origin)
    }

    // Save uploaded file
    const uploadsDir = path.join(process.cwd(), 'uploads', 'tax-profiles')
    await mkdir(uploadsDir, { recursive: true })

    const fileName = `tax-profile-upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const filePath = path.join(uploadsDir, fileName)
    await writeFile(filePath, buffer)

    const relativeFilePath = getRelativePath(filePath)

    // Process the import
    const result = await importTaxProfiles(
      companyId,
      authUser.userId,
      data,
      file.name,
      relativeFilePath
    )

    return withCors(
      ApiResponse.success({
        uploadId: result.uploadId,
        summary: {
          totalRecords: result.totalRecords,
          successful: result.successful,
          failed: result.failed,
        },
        errors: result.errors.slice(0, 50), // Limit errors returned
        hasMoreErrors: result.errors.length > 50,
      }, `Import completed. Successful: ${result.successful}, Failed: ${result.failed}`),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
