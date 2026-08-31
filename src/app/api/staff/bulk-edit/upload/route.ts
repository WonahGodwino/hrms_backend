// src/app/api/staff/bulk-edit/upload/route.ts
//
// POST — accepts the filled-in bulk-edit sheet (from /staff/bulk-edit/template)
// and updates existing StaffRecords. Each row is matched to an existing record
// by staffId (never used to create a new record, and never itself updated —
// it is the lookup key only). Only non-empty cells are applied, so leaving a
// field blank keeps the current value.
//
// The file is parsed synchronously (fast, in-memory) so obviously-bad input
// (wrong file type, missing staffId column, empty file) still gets an
// immediate 400. The row-by-row DB updates — the actual slow part for large
// sheets — happen in the background after the response is sent, the same
// async pattern used for payroll uploads, to avoid the request timing out on
// large staff lists. Poll GET /staff/bulk-edit/upload/status/[id] for progress.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { findIdentifierHolder, describeIdentifierCollision } from '@/app/lib/staff/identifierCollision'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import {
  getActiveStaffBulkEditUpload,
  createPendingStaffBulkEditUpload,
  completeStaffBulkEditUploadRecord,
  failStaffBulkEditUploadRecord,
  type StaffBulkEditResults,
} from '@/app/lib/staff/bulkEditUploadStatus'

// -----------------------------
// Helpers (mirrors staff/upload/route.ts's cell parsing)
// -----------------------------

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

function cellToString(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && Array.isArray(value?.richText)) {
    return value.richText.map((t: any) => t?.text || '').join('').trim()
  }
  if (typeof value === 'object' && value?.text !== undefined && value?.text !== null) {
    if (typeof value.text === 'object' && Array.isArray(value.text?.richText)) {
      return value.text.richText.map((t: any) => t?.text || '').join('').trim()
    }
    if (typeof value.text !== 'object') {
      return String(value.text).trim()
    }
  }
  if (typeof value === 'object' && value?.result !== undefined) {
    return String(value.result).trim()
  }
  if (typeof value === 'object') return ''
  return String(value).trim()
}

function cleanEmail(raw: any): string {
  let s = cellToString(raw)
  if (!s && typeof raw === 'object' && raw?.hyperlink) {
    s = String(raw.hyperlink)
  }
  s = s.replace(/ /g, ' ').trim()
  if (s.toLowerCase().startsWith('mailto:')) {
    s = s.slice('mailto:'.length).trim()
  }
  s = s.replace(/^<|>$/g, '').trim()
  return s.toLowerCase()
}

function isValidEmail(email: string): boolean {
  if (!email) return false
  if (email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizeHeader(h: string) {
  return h.toString().replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/\n/g, ' ').trim().toLowerCase()
}

function pick(row: any, keys: string[]) {
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

async function ensureUploadDirectories() {
  const baseDir = process.cwd()
  const uploadsDir = path.join(baseDir, 'uploads')
  await mkdir(uploadsDir, { recursive: true })
  return { baseDir, uploadsDir }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

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
    const companyId = formData.get('companyId') as string | null

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    if (authUser.role === 'HR') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId, role: { in: ['HR', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have HR access for this company', 403), origin)
      }
    } else if (authUser.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId, role: { in: ['ADMIN', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
      }
    }

    const company = await prisma.company.findFirst({ where: { id: companyId, archived: 0 }, select: { id: true, companyName: true } })
    if (!company) {
      return withCors(ApiResponse.error('Company not found or is archived', 404), origin)
    }

    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    // Only one bulk-edit upload may be in flight per company at a time.
    const activeUpload = await getActiveStaffBulkEditUpload(companyId)
    if (activeUpload) {
      return withCors(
        ApiResponse.error(
          'A staff bulk-edit upload is already being processed for this company. Please wait for it to finish before uploading another file.',
          409
        ),
        origin
      )
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    const isExcel = ['xlsx', 'xls'].includes(fileExtension || '')

    if (!isCsv && !isExcel) {
      return withCors(ApiResponse.error('Invalid file type. Please upload Excel or CSV files.', 400), origin)
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let data: any[] = []

    try {
      if (isCsv) {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
        if (!lines.length) {
          return withCors(ApiResponse.error('Empty CSV file', 400), origin)
        }
        const headers = splitCsvLine(lines[0])
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]
          if (!line || !line.trim()) continue
          const values = splitCsvLine(line)
          const rowData: any = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] ?? ''
          })
          const hasAny = Object.values(rowData).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
          if (hasAny) data.push(rowData)
        }
      } else {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(bytes as ArrayBuffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) {
          return withCors(ApiResponse.error('No worksheet found in Excel file', 400), origin)
        }

        // The bulk-edit template has a 4-row banner before the real header row —
        // find whichever row actually contains "staffId" rather than assuming row 1.
        let headerRowNumber = 1
        for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
          const values = worksheet.getRow(r).values as any[]
          const joined = (values || []).map((v) => normalizeHeader(cellToString(v))).join('|')
          if (joined.includes('staffid')) {
            headerRowNumber = r
            break
          }
        }

        const headers: string[] = []
        worksheet.getRow(headerRowNumber).eachCell((cell, colNumber) => {
          headers[colNumber - 1] = cellToString(cell.value) || `col${colNumber}`
        })

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= headerRowNumber) return
          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1] || `col${colNumber}`
            rowData[header] = cellToString(cell.value)
          })
          const hasAny = Object.values(rowData).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
          if (hasAny) data.push(rowData)
        })
      }
    } catch (parseError) {
      console.error('File parsing error:', parseError)
      return withCors(ApiResponse.error('Failed to parse file. Please check the file format.', 400), origin)
    }

    if (!data.length) {
      return withCors(ApiResponse.error('No valid data found in the file', 400), origin)
    }

    const actualColumnsLower = Object.keys(data[0] || {}).map((c) => normalizeHeader(c))
    if (!actualColumnsLower.includes('staffid')) {
      return withCors(ApiResponse.error('Missing required column: staffId', 400), origin)
    }

    const { uploadsDir } = await ensureUploadDirectories()
    const staffDir = path.join(uploadsDir, 'staff')
    await mkdir(staffDir, { recursive: true })

    const fileName = `staff-bulk-edit-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const savedFilePath = path.join(staffDir, fileName)
    await writeFile(savedFilePath, buffer)

    const uploadRecord = await createPendingStaffBulkEditUpload(
      companyId,
      `[Bulk Edit] ${file.name}`,
      getRelativePath(savedFilePath),
      authUser.userId,
      data.length
    )

    // Respond immediately; the row-by-row DB updates continue after the
    // response is sent. This process is a long-running Node server (not a
    // serverless function), so the event loop keeps running this work after
    // the request completes.
    processStaffBulkEditInBackground({
      uploadId: uploadRecord.id,
      data,
      companyId,
      companyName: company.companyName,
      userId: authUser.userId,
    }).catch((err) => {
      console.error('[STAFF_BULK_EDIT] Unhandled background processing error:', err)
    })

    console.log('[STAFF_BULK_EDIT] Accepted, processing in background', {
      uploadId: uploadRecord.id,
      companyId,
      totalRecords: data.length,
    })

    return withCors(
      ApiResponse.success(
        {
          apiSuccess: true,
          uploadId: uploadRecord.id,
          status: 'PROCESSING',
          totalRecords: data.length,
        },
        'Bulk edit file received and is being processed'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

async function processStaffBulkEditInBackground({
  uploadId,
  data,
  companyId,
  companyName,
  userId,
}: {
  uploadId: string
  data: any[]
  companyId: string
  companyName: string
  userId: string
}) {
  const results: StaffBulkEditResults & { formattedErrors: { row: number; message: string }[] } = {
    successful: 0,
    failed: 0,
    errors: [],
    formattedErrors: [],
  }

  try {
    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      const displayRow = index + 2

      try {
        const staffId = cellToString(pick(row, ['staffId', 'StaffID', 'STAFFID', 'Staff Id', 'Staff ID', 'STAFF ID']))

        if (!staffId) {
          throw new Error('Staff ID is required for every row.')
        }

        const existing = await prisma.staffRecord.findFirst({
          where: { companyId, staffId, isActive: true },
        })

        if (!existing) {
          throw new Error(`Staff ID "${staffId}" was not found in ${companyName}.`)
        }

        const updateData: Record<string, any> = {}

        const emailRaw = pick(row, ['email', 'Email', 'EMAIL', 'E-mail', 'E-Mail'])
        if (emailRaw !== undefined) {
          const email = cleanEmail(emailRaw)
          if (email) {
            if (!isValidEmail(email)) {
              throw new Error(`Invalid email format: "${cellToString(emailRaw)}".`)
            }
            if (email !== existing.email) {
              const emailHolder = await findIdentifierHolder(companyId, 'email', email, existing.id)
              if (emailHolder) {
                throw new Error(describeIdentifierCollision('email', email, emailHolder))
              }
              updateData.email = email
            }
          }
        }

        const fieldMap: Array<[string, string[]]> = [
          ['firstName', ['firstName', 'First Name', 'Firstname', 'FIRSTNAME']],
          ['lastName', ['lastName', 'Last Name', 'Lastname', 'LASTNAME']],
          ['department', ['department', 'Department', 'DEPARTMENT']],
          ['position', ['position', 'Position', 'POSITION']],
          ['phone', ['phone', 'Phone', 'PHONE']],
          ['bankName', ['bankName', 'Bank Name', 'BankName', 'BANK NAME']],
          ['accountNumber', ['accountNumber', 'Account Number', 'AccountNumber', 'ACCOUNT NUMBER']],
          ['bvn', ['bvn', 'BVN']],
        ]

        for (const [field, keys] of fieldMap) {
          const raw = pick(row, keys)
          if (raw === undefined) continue
          const value = cellToString(raw)
          if (value !== '' && value !== (existing as any)[field]) {
            updateData[field] = value
          }
        }

        if (Object.keys(updateData).length === 0) {
          // Nothing to change for this row — not an error, just a no-op.
          results.successful++
          continue
        }

        await prisma.staffRecord.update({
          where: { id: existing.id },
          data: { ...updateData, updatedBy: userId },
        })

        results.successful++
      } catch (error: any) {
        results.failed++
        const message = error?.message || 'An error occurred while processing this row.'
        results.errors.push(`Row ${displayRow}: ${message}`)
        results.formattedErrors.push({ row: displayRow, message })
      }
    }

    await completeStaffBulkEditUploadRecord(uploadId, results)

    console.log('[STAFF_BULK_EDIT] Completed successfully', {
      uploadId,
      companyId,
      successful: results.successful,
      failed: results.failed,
    })
  } catch (processingError: any) {
    console.error('[STAFF_BULK_EDIT] Processing error:', { uploadId, error: processingError })
    await failStaffBulkEditUploadRecord(uploadId, processingError.message || 'Unknown processing error')
  }
}
