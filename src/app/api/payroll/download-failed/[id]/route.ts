// src/app/api/payroll/download-failed/[id]/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get and verify authentication token
    const token = request.headers.get('authorization')?.replace('Bearer ', '') || null
    
    // Fix: Pass token which could be null
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    // Extract the ID from the dynamic URL segment
    const uploadId = params.id

    if (!uploadId) {
      return new Response(JSON.stringify({ error: 'Upload ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`Download request for upload ID: ${uploadId}`)

    // Find the upload record in database
    const uploadRecord = await prisma.payrollUpload.findUnique({
      where: { id: uploadId }
    })

    if (!uploadRecord) {
      return new Response(JSON.stringify({ error: 'Upload record not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!uploadRecord.processedFilePath) {
      return new Response(JSON.stringify({ error: 'No failed records file available for this upload' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if the file exists on the server
    try {
      await stat(uploadRecord.processedFilePath)
      console.log(`File found at: ${uploadRecord.processedFilePath}`)
    } catch (error) {
      console.error('File not found:', error)
      return new Response(JSON.stringify({ error: 'Failed records file not found on server' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Stream the file to the client
    const fileStream = createReadStream(uploadRecord.processedFilePath)
    const fileName = `failed-records-${uploadRecord.fileName || uploadRecord.id}.xlsx`
    
    console.log(`Streaming file: ${fileName}`)

    return new Response(fileStream as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, max-age=3600'
      }
    })
  } catch (error) {
    console.error('Failed records download error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}