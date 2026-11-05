// src/app/api/staff/download-failed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { writeStyledTable, buildSubtitle, confidentialFooter, safeFileName, attachmentDisposition, toneCell, XLSX_MIME } from '@/app/lib/excel/sheet-theme'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/staff/download-failed?uploadId=xxx
 *
 * - HR / SUPER_ADMIN / MANAGER can download failed staff upload errors.
 * - SUPER_ADMIN: can see all companies.
 * - HR / MANAGER: only uploads belonging to their company.
 * - Returns an .xlsx with S/N, Staff ID (best-effort), Error Message.
 */
export async function GET(request: NextRequest) {
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
    const user = requireRole(token, ['HR','SUPER_ADMIN','ADMIN', 'MANAGER'])

    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')

    if (!uploadId) {
      return withCors(
        ApiResponse.error('uploadId query parameter is required', 400),
        origin
      )
    }

    // Fetch the StaffUpload record
    const upload = await prisma.staffUpload.findUnique({
      where: { id: uploadId },
    })

    if (!upload) {
      return withCors(
        ApiResponse.error('Staff upload not found', 404),
        origin
      )
    }

    // Enforce company scoping. SUPER_ADMIN sees all; HR/MANAGER are scoped to
    // their single current company; ADMIN is checked against every company
    // they're actually assigned to via UserCompany — a plain companyId
    // equality check (the old behavior) incorrectly blocked an ADMIN
    // downloading records for a company they have real access to but that
    // isn't their token's "current" company.
    if (user.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: upload.companyId,
          role: { in: ['ADMIN', 'ALL'] }
        }
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error(
            'You are not authorized to download failed records for this upload',
            403
          ),
          origin
        )
      }
    } else if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('No company assigned for this user', 400),
          origin
        )
      }

      if (upload.companyId !== user.companyId) {
        return withCors(
          ApiResponse.error(
            'You are not authorized to download failed records for this upload',
            403
          ),
          origin
        )
      }
    }

    const rawErrors = (upload.errors as any) || []

    if (!Array.isArray(rawErrors) || rawErrors.length === 0) {
      return withCors(
        ApiResponse.error('No failed records found for this upload', 404),
        origin
      )
    }

    /**
     * Normalise into: { staffId: string; error: string }
     * - If element is a string, treat it as the full message.
     * - Try to extract staffId using regex if present in the message.
     * - If element is an object with { staffId, error }, use it directly.
     */
    const errorEntries: { staffId: string; error: string }[] =
      rawErrors.map((item: any) => {
        if (typeof item === 'string') {
          const message = item

          // Try to pull staffId from messages like:
          // "Row 5: Staff with ID EMP001 or email john@..."
          // or "Staff ID EMP001 already exists"
          let staffId = ''
          const match =
            message.match(/Staff(?:\s+with)?\s+ID\s+([A-Za-z0-9_-]+)/i) ||
            message.match(/StaffID\s*[:\-]?\s*([A-Za-z0-9_-]+)/i)

          if (match && match[1]) {
            staffId = match[1]
          }

          return { staffId, error: message }
        }

        // If it's already an object, try to read staffId & error properties
        return {
          staffId: item?.staffId ?? '',
          error:
            typeof item?.error === 'string'
              ? item.error
              : JSON.stringify(item),
        }
      })

    // Build Excel file with S/N, Staff ID, Error Message
    const company = await prisma.company.findUnique({ where: { id: upload.companyId }, select: { companyName: true } })
    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    const worksheet = workbook.addWorksheet('Failed Staff Records')

    writeStyledTable(worksheet, {
      title: 'Failed Staff Records',
      subtitle: buildSubtitle([company?.companyName, upload.fileName, `${errorEntries.length} failed`]),
      columns: [
        { header: 'S/N', key: 'sn', width: 8, align: 'center' },
        { header: 'Staff ID', key: 'staffId', width: 26, align: 'left' },
        { header: 'Error Message', key: 'error', width: 80, align: 'left' },
      ],
      rows: errorEntries.map((entry, index) => ({ sn: index + 1, staffId: entry.staffId || '', error: entry.error })),
      onRow: (row) => toneCell(row.getCell(3), 'danger'),
      footer: confidentialFooter(company?.companyName),
    })

    const buffer = await workbook.xlsx.writeBuffer()

    const response = new NextResponse(buffer as any, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': attachmentDisposition(`Failed Staff Records (${safeFileName(company?.companyName || 'Company')}).xlsx`),
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(response, origin)
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
