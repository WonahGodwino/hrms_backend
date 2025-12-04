// src/app/api/jobs/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import ExcelJS from 'exceljs'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])
    
    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }

    const companyId = user.companyId as string

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls'
    const isCsv = fileExtension === 'csv' || file.type === 'text/csv'

    if (!isExcel && !isCsv) {
      return withCors(ApiResponse.error('Invalid file format. Please upload an Excel or CSV file.', 400), origin)
    }

    // Read file content as buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Parse CSV/Excel
    let data: any[] = []

    try {
      const workbook = new ExcelJS.Workbook()

      if (isCsv) {
        const csvText = buffer.toString()
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
        if (!lines.length) throw new Error('Empty CSV file')

        const headers = lines[0].split(',').map((header) => header.trim())
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map((value) => value.trim())
          const rowData: any = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] || ''
          })
          data.push(rowData)
        }
      } else {
        await workbook.xlsx.load(bytes as ArrayBuffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) throw new Error('No worksheet found in Excel file')

        const headers: string[] = []
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber - 1] = cell.value?.toString().trim() || `col${colNumber}`
        })

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 1) return // skip header row

          const rowData: any = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            rowData[header] = cell.value
          })
          data.push(rowData)
        })
      }
    } catch (parseError) {
      return withCors(ApiResponse.error('Failed to parse file. Please check the file format.', 400), origin)
    }

    if (!data.length) {
      return withCors(ApiResponse.error('No job data found in the file', 400), origin)
    }

    // Create jobs from parsed data
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (let index = 0; index < data.length; index++) {
      const row = data[index]
      try {
        const rowData = row as any

        const { title, description, department, position, expirationDate } = rowData
        if (!title || !description || !department || !position || !expirationDate) {
          results.failed++
          results.errors.push(`Row ${index + 1}: Missing required fields`)
          continue
        }

        const job = await prisma.job.create({
          data: {
            title,
            description,
            department,
            position,
            companyId,
            expirationDate: new Date(expirationDate), // Convert to Date
            createdBy: user.userId,
            updatedBy: user.userId,
          },
        })
        results.successful++
      } catch (error) {
        results.failed++
        results.errors.push(`Row ${index + 1}: ${error.message}`)
      }
    }

    return withCors(ApiResponse.success(results, 'Job postings uploaded successfully'), origin)
  } catch (error) {
    return withCors(ApiResponse.error(error.message, 500), origin)
  }
}
