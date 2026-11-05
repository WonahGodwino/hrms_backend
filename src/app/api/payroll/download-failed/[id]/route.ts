// src/app/api/payroll/download-failed/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { hasModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import fs from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { attachmentDisposition, buildSubtitle, confidentialFooter, safeFileName, toneCell, writeStyledTable } from '@/app/lib/excel/sheet-theme'

type RouteParams = {
  params: {
    id: string
  }
}

// Helper function to resolve path (handles both absolute and relative)
function resolveFilePath(storedPath: string): string {
  if (!storedPath) {
    throw new Error('File path is empty')
  }

  // If it's already an absolute path, return it
  if (path.isAbsolute(storedPath)) {
    return storedPath
  }

  // If it starts with /, it's a Unix absolute path
  if (storedPath.startsWith('/')) {
    return storedPath
  }

  // If it starts with uploads/, treat it as relative to project root
  if (storedPath.startsWith('uploads/')) {
    return path.join(process.cwd(), storedPath)
  }

  // Otherwise, assume it's relative to project root
  return path.join(process.cwd(), storedPath)
}

// Helper function to generate file from errors if file doesn't exist
async function generateFailedRecordsFile(
  payrollUpload: any,
  fileName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '24/7HR'
  const worksheet = workbook.addWorksheet('Failed Records')

  const errorRows: { rowNumber: string | number; error: string }[] = []
  if (payrollUpload.errors && Array.isArray(payrollUpload.errors)) {
    payrollUpload.errors.forEach((error: string, index: number) => {
      // Parse row number from error message (assuming format "Row X: error message")
      const rowMatch = error.match(/Row (\d+):/)
      errorRows.push({
        rowNumber: rowMatch ? rowMatch[1] : index + 1,
        error: error.replace(/Row \d+: /, ''),
      })
    })
  } else {
    errorRows.push({ rowNumber: 'N/A', error: 'No detailed error information available' })
  }

  writeStyledTable(worksheet, {
    title: 'Failed Payroll Records',
    subtitle: buildSubtitle([fileName, `${errorRows.length} issue${errorRows.length === 1 ? '' : 's'}`]),
    columns: [
      { header: 'Row Number', key: 'rowNumber', width: 14, align: 'center' },
      { header: 'Error', key: 'error', width: 100, align: 'left' },
    ],
    rows: errorRows,
    onRow: (row) => toneCell(row.getCell(2), 'danger'),
    footer: confidentialFooter(),
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer as any)
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    // Role check only here — module access is checked below against the
    // upload's own company once it's known (see download-original/[id] for
    // the same reasoning): requireModuleAccess would otherwise gate on the
    // token's "current" company, not the one this specific upload belongs to.
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { id } = params

    // Find the payroll upload by id first, then check access — a plain
    // company-equality pre-filter here would 404 an ADMIN who has real
    // UserCompany access to the upload's company but whose token's "current"
    // companyId happens to be a different assigned company.
    const payrollUpload = await prisma.payrollUpload.findUnique({
      where: { id },
    })

    if (!payrollUpload) {
      return withCors(
        ApiResponse.error('Payroll upload not found', 404),
        origin
      )
    }

    if (user.role === 'HR' && user.companyId !== payrollUpload.companyId) {
      return withCors(
        ApiResponse.error('You do not have access to this upload record', 403),
        origin
      )
    }

    if (user.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: payrollUpload.companyId,
          role: { in: ['ADMIN', 'ALL'] }
        }
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have access to this upload record', 403),
          origin
        )
      }
    }

    if (user.role !== 'SUPER_ADMIN') {
      const moduleEnabled = await hasModuleAccess(payrollUpload.companyId, 'PAYROLL')
      if (!moduleEnabled) {
        return withCors(
          ApiResponse.error('Insufficient permissions: This module is not available for your organisation', 403),
          origin
        )
      }
    }

    // The file path should be stored in processedFilePath
    const filePathToUse = payrollUpload.processedFilePath

    if (!filePathToUse) {
      return withCors(
        ApiResponse.error('Failed records file not available', 404),
        origin
      )
    }

    console.log(`[DOWNLOAD_FAILED] Stored path: ${filePathToUse}`)

    let fileBuffer: Buffer | null = null
    let foundPath: string | null = null

    try {
      // Try to resolve and read the file
      const fullFilePath = resolveFilePath(filePathToUse)
      console.log(`[DOWNLOAD_FAILED] Resolved path: ${fullFilePath}`)

      try {
        fileBuffer = await fs.readFile(fullFilePath)
        foundPath = fullFilePath
        console.log(`[DOWNLOAD_FAILED] File found at: ${foundPath}`)
      } catch (error) {
        console.log(
          `[DOWNLOAD_FAILED] File not found at primary location: ${fullFilePath}`
        )

        // Try alternative locations
        const fileName = path.basename(filePathToUse)
        const alternativePaths = [
          // Primary expected location
          path.join(process.cwd(), 'uploads', 'payroll', fileName),
          // Try with just the filename
          path.join(process.cwd(), 'uploads', 'payroll', fileName),
          // Alternative uploads location
          path.join(process.cwd(), 'public', 'uploads', 'payroll', fileName),
          // Just in public directory
          path.join(process.cwd(), 'public', fileName),
          // Try using the upload ID
          path.join(
            process.cwd(),
            'uploads',
            'payroll',
            `failed-records-${payrollUpload.id}.xlsx`
          ),
        ]

        for (const altPath of alternativePaths) {
          try {
            console.log(`[DOWNLOAD_FAILED] Trying alternative: ${altPath}`)
            fileBuffer = await fs.readFile(altPath)
            foundPath = altPath
            console.log(`[DOWNLOAD_FAILED] Found at alternative: ${foundPath}`)
            break
          } catch (err) {
            continue
          }
        }
      }

      // If still no file found, generate it from errors
      if (!fileBuffer) {
        console.log(
          '[DOWNLOAD_FAILED] File not found, generating from errors...'
        )

        // Ensure uploads directory exists
        const uploadDir = path.join(process.cwd(), 'uploads', 'payroll')
        await fs.mkdir(uploadDir, { recursive: true })

        // Generate new file
        const generatedFileName = `failed-records-${payrollUpload.id}-regenerated.xlsx`
        const generatedFilePath = path.join(uploadDir, generatedFileName)

        fileBuffer = await generateFailedRecordsFile(
          payrollUpload,
          generatedFileName
        )

        // Save the generated file for future use
        await fs.writeFile(generatedFilePath, fileBuffer)

        // Update the database with the new path
        await prisma.payrollUpload.update({
          where: { id: payrollUpload.id },
          data: {
            processedFilePath: path.relative(process.cwd(), generatedFilePath),
          },
        })

        foundPath = generatedFilePath
        console.log(`[DOWNLOAD_FAILED] Generated new file at: ${foundPath}`)
      }
    } catch (error) {
      console.error('[DOWNLOAD_FAILED] Error finding/generating file:', error)

      // Last resort: generate in memory without saving
      try {
        fileBuffer = await generateFailedRecordsFile(
          payrollUpload,
          `failed-records-${payrollUpload.id}.xlsx`
        )
        console.log('[DOWNLOAD_FAILED] Generated file in memory')
      } catch (genError) {
        console.error(
          '[DOWNLOAD_FAILED] Failed to generate error file:',
          genError
        )
        return withCors(
          ApiResponse.error(
            'Failed records file not found and could not be regenerated',
            404
          ),
          origin
        )
      }
    }

    // Determine content type
    const extension = foundPath
      ? path.extname(foundPath).toLowerCase()
      : '.xlsx'
    let contentType = 'application/octet-stream'

    if (extension === '.xlsx' || extension === '.xls') {
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    } else if (extension === '.csv') {
      contentType = 'text/csv'
    }

    const uint8Array = new Uint8Array(fileBuffer)
    const blob = new Blob([uint8Array], { type: contentType })

    const uploadCompany = await prisma.company.findUnique({ where: { id: payrollUpload.companyId }, select: { companyName: true } })
    const fileName = `Failed Payroll Records (${safeFileName(uploadCompany?.companyName || 'Company')}).xlsx`

    const response = new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': attachmentDisposition(fileName),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    const message = formatError(error)
    console.error('[DOWNLOAD_FAILED] Top-level error:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}