import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
//import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { writeFile } from 'fs/promises'
import path from 'path'


export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')

    if (!uploadId) {
      return withCors(ApiResponse.error('Upload ID is required', 400), origin)
    }

    // Get failed records associated with the upload
    const failedRecords = await prisma.staffUpload.findUnique({
      where: { id: uploadId },
      //include: { errors: true }, // Ensure the errors are available
    })

    if (!failedRecords || failedRecords.errors.length === 0) {
      return withCors(ApiResponse.error('No failed records found for this upload', 404), origin)
    }

    // Prepare the Excel file for failed records
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Failed Staff Records')

    worksheet.columns = [
      { header: 'Staff ID', key: 'staffId', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'First Name', key: 'firstName', width: 20 },
      { header: 'Last Name', key: 'lastName', width: 20 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Position', key: 'position', width: 20 },
      { header: 'Error', key: 'error', width: 50 },
    ]

    failedRecords.errors.forEach((errorRecord) => {
      worksheet.addRow({
        staffId: errorRecord.staffId,
        email: errorRecord.email,
        firstName: errorRecord.firstName,
        lastName: errorRecord.lastName,
        department: errorRecord.department,
        position: errorRecord.position,
        error: errorRecord.error,
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()

    // Generate response
    const filePath = path.join(process.cwd(), 'uploads', 'failed_records.xlsx')
    await writeFile(filePath, buffer)

    const excelResponse = new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="failed_records.xlsx"`,
        'Cache-Control': 'no-cache',
      },
    })

    return withCors(excelResponse, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
