// src/app/api/staff/compensation/upload/route.ts
//
// Bulk-seeds StaffPayrollProfile rows (the recurring compensation baseline
// Payroll Generation reads from) from a spreadsheet shaped like the sheet
// downloaded from /staff/compensation/template/download — the real
// company payroll sheets HR already has can be used as-is, matched by
// Staff ID. Only columns matching a Manual or Fixed Profile field on the
// given template are read (formula fields and staff/period-derived fields
// aren't part of this sheet at all); a blank cell leaves that staff
// member's existing value for that field unchanged. Processed
// synchronously — a company's active-staff list is small enough that this
// completes well within a normal request. Entirely new endpoint; does not
// touch the existing payroll upload pipeline.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import {
  STAFF_RECORD_DERIVED_SYSTEM_FIELDS,
  PERIOD_DERIVED_SYSTEM_FIELDS,
  GROSS_SYSTEM_FIELD,
  DAYS_WORKED_SYSTEM_FIELD,
  DAYS_WORKED_DISPLAY_NAME
} from '@/app/lib/payroll/generation/field-resolver'
import { cellToString } from '@/app/lib/offer-letters/excelCell'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
}

type CompensationFieldLike = { systemField: string; displayName: string; dataType: string; required: boolean; aliases?: unknown }

// Gross is a standalone, directly-entered figure (not a computed sum) —
// always offered here regardless of whether the current template declares
// a matching field, so it can be used as a PERCENTAGE base in any template.
const GROSS_FIELD: CompensationFieldLike = { systemField: GROSS_SYSTEM_FIELD, displayName: 'Gross', dataType: 'Number', required: false }

// Fixed the same way Gross is — always offered regardless of template
// config, so attendance proration always has a place to read from.
const DAYS_WORKED_FIELD: CompensationFieldLike = { systemField: DAYS_WORKED_SYSTEM_FIELD, displayName: DAYS_WORKED_DISPLAY_NAME, dataType: 'Days', required: false }

function normalizeHeader(h: string): string {
  return h
    .toString()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function splitCsvLine(line: string): string[] {
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
      result.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  result.push(cur.trim())
  return result
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
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null
    const templateId = formData.get('templateId') as string | null

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }
    if (!templateId) {
      return withCors(ApiResponse.error('Template selection is required', 400), origin)
    }
    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const template = await prisma.payrollTemplate.findFirst({
      where: { id: templateId, companyId },
      include: { fields: { orderBy: { order: 'asc' } } }
    })
    if (!template) {
      return withCors(ApiResponse.error('Payroll template not found for this company', 404), origin)
    }

    // Compulsory identity fields (Staff ID, Name, Email, Department) resolve
    // straight from the staff record, and Month always comes from the pay
    // period being generated — neither belongs here. Everything else that
    // isn't computed by a formula (Manual + Fixed Profile) does, plus the
    // standalone Gross figure, which is always offered.
    const templateFields: CompensationFieldLike[] = template.fields.filter(
      (f) =>
        (f.valueSource === 'FIXED_PROFILE' || f.valueSource === 'MANUAL') &&
        !STAFF_RECORD_DERIVED_SYSTEM_FIELDS.includes(f.systemField) &&
        !PERIOD_DERIVED_SYSTEM_FIELDS.includes(f.systemField)
    )
    const profileFields: CompensationFieldLike[] = [GROSS_FIELD, DAYS_WORKED_FIELD, ...templateFields]

    const headerMap = new Map<string, (typeof profileFields)[number]>()
    profileFields.forEach((field) => {
      headerMap.set(normalizeHeader(field.displayName), field)
      headerMap.set(normalizeHeader(field.systemField), field)
      if (Array.isArray(field.aliases)) {
        field.aliases.forEach((alias) => {
          if (typeof alias === 'string') headerMap.set(normalizeHeader(alias), field)
        })
      }
    })

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isCsv = file.type === 'text/csv' || fileExtension === 'csv'
    const isExcel = ['xlsx', 'xls'].includes(fileExtension || '')
    if (!isCsv && !isExcel) {
      return withCors(ApiResponse.error('Invalid file type. Please upload an Excel or CSV file.', 400), origin)
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Save the original file so it can be re-downloaded later from the
    // upload history — reused as-is (or lightly edited) for a subsequent
    // rollout instead of rebuilding it from scratch every time.
    const uploadsDir = path.join(process.cwd(), 'uploads', 'staff-compensation')
    await mkdir(uploadsDir, { recursive: true })
    const savedFileName = `staff-compensation-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const savedFilePath = path.join(uploadsDir, savedFileName)
    await writeFile(savedFilePath, buffer)

    type ParsedRow = { staffId: string; values: Record<string, string> }
    const rows: ParsedRow[] = []

    try {
      if (isCsv) {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
        if (!lines.length) {
          return withCors(ApiResponse.error('Empty CSV file', 400), origin)
        }

        let headerRowIndex = -1
        let columnFields: Array<{ colIndex: number; field: (typeof profileFields)[number] }> = []
        let staffIdCol = -1

        for (let i = 0; i < lines.length; i++) {
          const candidateHeaders = splitCsvLine(lines[i])
          const candidateColumns: Array<{ colIndex: number; field: (typeof profileFields)[number] }> = []
          let candidateStaffIdCol = -1
          candidateHeaders.forEach((header, idx) => {
            const normalized = normalizeHeader(header)
            if (normalized === 'staffid') candidateStaffIdCol = idx
            const field = headerMap.get(normalized)
            if (field) candidateColumns.push({ colIndex: idx, field })
          })
          if (candidateStaffIdCol !== -1 && candidateColumns.length > 0) {
            headerRowIndex = i
            columnFields = candidateColumns
            staffIdCol = candidateStaffIdCol
            break
          }
        }

        if (headerRowIndex === -1) {
          return withCors(ApiResponse.error('Could not find a header row with a Staff ID column and at least one matching field column.', 400), origin)
        }

        for (let i = headerRowIndex + 1; i < lines.length; i++) {
          const cells = splitCsvLine(lines[i])
          const staffId = cells[staffIdCol]?.trim()
          if (!staffId) continue
          const values: Record<string, string> = {}
          columnFields.forEach(({ colIndex, field }) => {
            const raw = cells[colIndex]
            if (raw !== undefined && raw !== '') values[field.systemField] = raw
          })
          rows.push({ staffId, values })
        }
      } else {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(bytes as ArrayBuffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) {
          return withCors(ApiResponse.error('No worksheet found in Excel file', 400), origin)
        }

        let headerRowNumber = -1
        let columnFields: Array<{ colIndex: number; field: (typeof profileFields)[number] }> = []
        let staffIdCol = -1

        for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
          const candidateColumns: Array<{ colIndex: number; field: (typeof profileFields)[number] }> = []
          let candidateStaffIdCol = -1
          worksheet.getRow(r).eachCell((cell, colNumber) => {
            const normalized = normalizeHeader(cellToString(cell.value))
            if (normalized === 'staffid') candidateStaffIdCol = colNumber
            const field = headerMap.get(normalized)
            if (field) candidateColumns.push({ colIndex: colNumber, field })
          })
          if (candidateStaffIdCol !== -1 && candidateColumns.length > 0) {
            headerRowNumber = r
            columnFields = candidateColumns
            staffIdCol = candidateStaffIdCol
            break
          }
        }

        if (headerRowNumber === -1) {
          return withCors(ApiResponse.error('Could not find a header row with a Staff ID column and at least one matching field column.', 400), origin)
        }

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= headerRowNumber || row.getCell(1).isMerged) return
          const staffId = cellToString(row.getCell(staffIdCol).value).trim()
          if (!staffId) return
          const values: Record<string, string> = {}
          columnFields.forEach(({ colIndex, field }) => {
            const raw = cellToString(row.getCell(colIndex).value)
            if (raw !== '') values[field.systemField] = raw
          })
          rows.push({ staffId, values })
        })
      }
    } catch (parseError) {
      console.error('[STAFF_COMPENSATION_UPLOAD] File parsing error:', parseError)
      return withCors(ApiResponse.error('Failed to parse file. Please check the file format.', 400), origin)
    }

    if (!rows.length) {
      return withCors(ApiResponse.error('No valid data rows found in the file', 400), origin)
    }

    const results = { successful: 0, failed: 0, errors: [] as { row: number; message: string }[] }

    for (let i = 0; i < rows.length; i++) {
      const { staffId, values } = rows[i]
      const displayRow = i + 2

      try {
        const staffRecord = await prisma.staffRecord.findFirst({
          where: { companyId, staffId, isActive: true },
          select: { id: true }
        })
        if (!staffRecord) {
          throw new Error(`Staff ID "${staffId}" was not found among active staff.`)
        }

        if (Object.keys(values).length === 0) {
          results.successful++
          continue
        }

        const coerced: Record<string, number | string> = {}
        for (const field of profileFields) {
          const raw = values[field.systemField]
          if (raw === undefined) continue
          if (field.dataType === 'Number') {
            const n = Number(raw)
            if (!Number.isFinite(n)) {
              throw new Error(`"${field.displayName}" must be a number (got "${raw}").`)
            }
            coerced[field.systemField] = n
          } else {
            coerced[field.systemField] = raw
          }
        }

        const existing = await prisma.staffPayrollProfile.findUnique({ where: { staffId: staffRecord.id } })
        const mergedValues: Record<string, any> = { ...(existing?.values as Record<string, unknown> | undefined), ...coerced }

        await prisma.staffPayrollProfile.upsert({
          where: { staffId: staffRecord.id },
          create: {
            staffId: staffRecord.id,
            companyId,
            templateId,
            values: mergedValues,
            updatedBy: user.userId
          },
          update: {
            templateId,
            values: mergedValues,
            updatedBy: user.userId
          }
        })

        results.successful++
      } catch (error: any) {
        results.failed++
        results.errors.push({ row: displayRow, message: error?.message || 'An error occurred while processing this row.' })
      }
    }

    const uploadRecord = await prisma.staffCompensationUpload.create({
      data: {
        companyId,
        templateId,
        fileName: file.name,
        filePath: getRelativePath(savedFilePath),
        totalRecords: rows.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors,
        uploadedBy: user.userId
      }
    })

    return withCors(
      ApiResponse.success(
        { uploadId: uploadRecord.id, successful: results.successful, failed: results.failed, errors: results.errors, totalRows: rows.length },
        'Staff compensation upload processed'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
