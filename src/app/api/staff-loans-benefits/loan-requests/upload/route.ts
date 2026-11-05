// src/app/api/staff-loans-benefits/loan-requests/upload/route.ts
//
// Supporting-document upload for loan applications (the "Loan process POP"
// and optional signature image in the Apply-for-Loan wizard). Stores the file
// under uploads/loan-documents/ and returns the document URL to attach to the
// LoanRequest.documentUrls array on submission.
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { withCors, handleCorsOptions } from '@/app/lib/cors'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB — matches the wizard's stated cap
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png']

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(NextResponse.json({ success: false, message: 'Authorization header missing' }, { status: 401 }), origin)
    }
    await requireModuleAccess(authHeader.replace('Bearer ', ''), 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || typeof file === 'string') {
      return withCors(NextResponse.json({ success: false, message: 'A file is required' }, { status: 400 }), origin)
    }
    if (file.size > MAX_FILE_BYTES) {
      return withCors(NextResponse.json({ success: false, message: 'File exceeds the 5MB limit' }, { status: 400 }), origin)
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return withCors(NextResponse.json({ success: false, message: 'Only PDF, JPG or PNG files are allowed' }, { status: 400 }), origin)
    }

    const documentsDir = path.join(process.cwd(), 'uploads', 'loan-documents')
    await mkdir(documentsDir, { recursive: true })

    const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `loan-doc-${randomUUID()}-${sanitized}`
    await writeFile(path.join(documentsDir, fileName), Buffer.from(await file.arrayBuffer()))

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Document uploaded',
        data: {
          documentUrl: `/api/staff-loans-benefits/loan-requests/documents/${fileName}`,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      }),
      origin
    )
  } catch (error: any) {
    console.error('Error uploading loan document:', error)
    return withCors(
      NextResponse.json({ success: false, message: error?.message || 'Failed to upload document' }, { status: 500 }),
      origin
    )
  }
}
