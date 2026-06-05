// src/app/api/grade-levels/template/download/route.ts
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    // Create CSV template
    const headers = ['Name', 'Rank', 'Steps', 'Base Pay', 'Base Pay Frequency', 'Auto Progression', 'Progression Timeline (months)']
    const exampleRow = ['Senior Management', '8', '5', '5000000', 'Yearly', 'true', '12']
    const instructionRow = ['# Instructions: Name is required, Rank must be unique, Steps min 1 max 20', '', '', '', '', '', '']
    
    const csvContent = [
      instructionRow.join(','),
      headers.join(','),
      exampleRow.join(',')
    ].join('\n')
    
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="grade-levels-template.csv"',
        'Cache-Control': 'private, max-age=0'
      }
    })
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}