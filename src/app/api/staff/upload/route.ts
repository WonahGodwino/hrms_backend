// src/app/api/staff/upload/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return ApiResponse.error('No file uploaded', 400)
    }

    // Validate file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ]
    
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!allowedTypes.includes(file.type) && !['xlsx', 'xls', 'csv'].includes(fileExtension || '')) {
      return ApiResponse.error('Invalid file type. Please upload Excel or CSV files.', 400)
    }

    // Read and parse file with ExcelJS
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    let data: any[] = []
    
    try {
      const workbook = new ExcelJS.Workbook()
      
      if (file.type === 'text/csv' || fileExtension === 'csv') {
        // For CSV files, we'll use a different approach
        const csvText = buffer.toString()
        const lines = csvText.split('\n')
        const headers = lines[0].split(',').map(header => header.trim())
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            const values = lines[i].split(',').map(value => value.trim())
            const rowData: any = {}
            headers.forEach((header, index) => {
              rowData[header] = values[index] || ''
            })
            data.push(rowData)
          }
        }
      } else {
        // For Excel files
        await workbook.xlsx.load(buffer)
        const worksheet = workbook.worksheets[0]
        
        // Get headers from first row
        const headers: string[] = []
        const headerRow = worksheet.getRow(1)
        headerRow.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = cell.value?.toString() || `col${colNumber}`
        })

        // Process data rows
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) { // Skip header row
            const rowData: any = {}
            row.eachCell((cell, colNumber) => {
              const header = headers[colNumber - 1]
              rowData[header] = cell.value
            })
            data.push(rowData)
          }
        })
      }
    } catch (parseError) {
      console.error('File parsing error:', parseError)
      return ApiResponse.error('Failed to parse file. Please check the file format.', 400)
    }

    if (!data.length) {
      return ApiResponse.error('No data found in the file', 400)
    }

    // Validate required columns
    const requiredColumns = ['staffId', 'email', 'firstName', 'lastName', 'department', 'position']
    const firstRow = data[0]
    const actualColumns = Object.keys(firstRow)
    const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col))
    
    if (missingColumns.length > 0) {
      return ApiResponse.error(`Missing required columns: ${missingColumns.join(', ')}. Found columns: ${actualColumns.join(', ')}`, 400)
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
      records: [] as any[]
    }

    // Process each staff record
    for (const [index, row] of data.entries()) {
      try {
        const rowData = row as any
        
        const staffId = rowData.staffId || rowData.StaffID || rowData['Staff ID']
        const email = rowData.email || rowData.Email
        const firstName = rowData.firstName || rowData['First Name']
        const lastName = rowData.lastName || rowData['Last Name']
        const department = rowData.department || rowData.Department
        const position = rowData.position || rowData.Position
        const phone = rowData.phone || rowData.Phone
        const bankName = rowData.bankName || rowData['Bank Name']
        const accountNumber = rowData.accountNumber || rowData['Account Number']
        const bvn = rowData.bvn || rowData.BVN

        // Validate required fields
        if (!staffId || !email || !firstName || !lastName || !department || !position) {
          results.failed++
          results.errors.push(`Row ${index + 2}: Missing required fields`)
          continue
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
          results.failed++
          results.errors.push(`Row ${index + 2}: Invalid email format: ${email}`)
          continue
        }

        // Validate staff ID format (alphanumeric, 3-20 characters)
        const staffIdRegex = /^[a-zA-Z0-9]{3,20}$/
        if (!staffIdRegex.test(staffId)) {
          results.failed++
          results.errors.push(`Row ${index + 2}: Staff ID must be 3-20 alphanumeric characters`)
          continue
        }

        // Check for duplicate staffId or email
        const existingStaff = await prisma.staffRecord.findFirst({
          where: {
            OR: [
              { staffId },
              { email: email.toLowerCase() }
            ]
          }
        })

        if (existingStaff) {
          results.failed++
          results.errors.push(`Row ${index + 2}: Staff with ID ${staffId} or email ${email} already exists`)
          continue
        }

        // Create staff record
        const staffRecord = await prisma.staffRecord.create({
          data: {
            staffId,
            email: email.toLowerCase(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            department: department.trim(),
            position: position.trim(),
            phone: phone?.toString().trim(),
            bankName: bankName?.toString().trim(),
            accountNumber: accountNumber?.toString().trim(),
            bvn: bvn?.toString().trim()
          }
        })

        results.records.push(staffRecord)
        results.successful++
      } catch (error) {
        results.failed++
        results.errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Save upload record
    const uploadDir = path.join(process.cwd(), 'uploads', 'staff')
    await mkdir(uploadDir, { recursive: true })
    
    const uploadRecord = await prisma.staffUpload.create({
      data: {
        fileName: file.name,
        filePath: path.join(uploadDir, file.name),
        totalRecords: data.length,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors,
        uploadedBy: user.userId
      }
    })

    // Save the original file
    await writeFile(path.join(uploadDir, file.name), buffer)

    return ApiResponse.success(
      { 
        results,
        uploadId: uploadRecord.id,
        summary: {
          totalProcessed: data.length,
          successful: results.successful,
          failed: results.failed
        },
        // Provide download link for failed records if any
        ...(results.failed > 0 && {
          failedRecordsInfo: `${results.failed} records failed. Check errors array for details.`
        })
      },
      `Staff records processing completed. Successful: ${results.successful}, Failed: ${results.failed}`
    )
  } catch (error) {
    return handleApiError(error)
  }
}

// GET endpoint to download staff template using ExcelJS
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    requireRole(token, ['HR', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'template') {
      // Create template using ExcelJS
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Staff Records')

      // Define columns with proper styling
      worksheet.columns = [
        { header: 'staffId', key: 'staffId', width: 15 },
        { header: 'email', key: 'email', width: 25 },
        { header: 'firstName', key: 'firstName', width: 15 },
        { header: 'lastName', key: 'lastName', width: 15 },
        { header: 'department', key: 'department', width: 20 },
        { header: 'position', key: 'position', width: 20 },
        { header: 'phone', key: 'phone', width: 15 },
        { header: 'bankName', key: 'bankName', width: 20 },
        { header: 'accountNumber', key: 'accountNumber', width: 20 },
        { header: 'bvn', key: 'bvn', width: 15 }
      ]

      // Style the header row
      const headerRow = worksheet.getRow(1)
      headerRow.font = { 
        bold: true, 
        color: { argb: 'FFFFFFFF' },
        size: 12
      }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2F5496' } // Blue background
      }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

      // Add sample data
      const sampleData = [
        {
          staffId: 'EMP001',
          email: 'john.doe@company.com',
          firstName: 'John',
          lastName: 'Doe',
          department: 'Customer Service',
          position: 'CSR',
          phone: '+2348012345678',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          bvn: '12345678901'
        },
        {
          staffId: 'EMP002',
          email: 'jane.smith@company.com',
          firstName: 'Jane',
          lastName: 'Smith',
          department: 'Sales',
          position: 'Telesales Agent',
          phone: '+2348098765432',
          bankName: 'First Bank',
          accountNumber: '9876543210',
          bvn: '10987654321'
        }
      ]

      sampleData.forEach(data => {
        worksheet.addRow(data)
      })

      // Style data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip header row
          row.alignment = { vertical: 'middle', horizontal: 'left' }
          row.font = { size: 11 }
          
          // Alternate row colors for readability
          if (rowNumber % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' } // Light gray
            }
          }
        }
      })

      // Add data validation notes
      worksheet.addRow([]) // Empty row
      worksheet.addRow(['IMPORTANT NOTES:'])
      worksheet.addRow(['- staffId: Unique staff ID (3-20 alphanumeric characters, REQUIRED)'])
      worksheet.addRow(['- email: Valid email address (REQUIRED)'])
      worksheet.addRow(['- firstName, lastName: Staff names (REQUIRED)'])
      worksheet.addRow(['- department, position: Staff details (REQUIRED)'])
      worksheet.addRow(['- phone, bankName, accountNumber, bvn: Optional fields'])

      // Style notes
      for (let i = worksheet.rowCount - 6; i <= worksheet.rowCount; i++) {
        const noteRow = worksheet.getRow(i)
        noteRow.font = { italic: true, color: { argb: 'FFFF0000' }, size: 10 }
      }

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer()
      
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="staff-records-template.xlsx"',
          'Cache-Control': 'no-cache'
        }
      })
    }

    return ApiResponse.error('Invalid action')
  } catch (error) {
    return handleApiError(error)
  }
}