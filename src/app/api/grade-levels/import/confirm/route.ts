// src/app/api/grade-levels/import/confirm/route.ts
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'

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
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    const body = await request.json()
    const { sessionId } = body
    
    const session = (global as any)._importSessions?.[sessionId]
    
    if (!session || session.userId !== user.userId) {
      throw new Error('Invalid or expired session')
    }
    
    let created = 0
    let skipped = 0
    
    for (const item of session.data) {
      try {
        await prisma.gradeLevel.create({
          data: {
            name: item.name,
            rank: parseInt(item.rank),
            totalSteps: parseInt(item.steps),
            basePay: item.basePay !== 'Not set' ? parseFloat(item.basePay) : null,
            basePayFrequency: item.basePayFrequency,
            autoProgression: item.autoProgression === 'true',
            progressionTimeline: parseInt(item.progressionTimeline),
            companyId: session.companyId,
            createdBy: user.userId,
            steps: {
              create: Array(parseInt(item.steps)).fill(null).map((_, idx) => ({
                stepNumber: idx + 1,
                incrementPercent: 0
              }))
            }
          }
        })
        created++
      } catch (error) {
        skipped++
        console.error(`Failed to create grade level ${item.name}:`, error)
      }
    }
    
    // Clean up session
    delete (global as any)._importSessions[sessionId]
    
    return withCors(ApiResponse.success({
      created,
      skipped
    }, 'Import processed successfully'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}