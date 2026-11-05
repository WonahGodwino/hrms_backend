// src/app/api/staff-loans-benefits/loan-requests/documents/[...path]/route.ts
//
// Authenticated download for uploaded loan supporting documents (POP, signature
// images). Filenames are server-generated UUIDs, so only module members with a
// valid token can fetch them.
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { withCors, handleCorsOptions } from '@/app/lib/cors'

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(NextResponse.json({ success: false, message: 'Authorization header missing' }, { status: 401 }), origin)
    }
    await requireModuleAccess(authHeader.replace('Bearer ', ''), 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const { path: segments } = await params
    // Only a bare server-generated filename is ever expected — reject anything
    // that looks like a path traversal attempt.
    const fileName = segments.join('/')
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return withCors(NextResponse.json({ success: false, message: 'Invalid document path' }, { status: 400 }), origin)
    }

    const documentsDir = path.join(process.cwd(), 'uploads', 'loan-documents')
    const filePath = path.join(documentsDir, fileName)

    try {
      const buffer = await readFile(filePath)
      const contentType = MIME_BY_EXT[path.extname(fileName).toLowerCase()] || 'application/octet-stream'
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${fileName}"`,
        },
      })
    } catch {
      return withCors(NextResponse.json({ success: false, message: 'Document not found' }, { status: 404 }), origin)
    }
  } catch (error: any) {
    console.error('Error fetching loan document:', error)
    return withCors(
      NextResponse.json({ success: false, message: error?.message || 'Failed to fetch document' }, { status: 500 }),
      origin
    )
  }
}
