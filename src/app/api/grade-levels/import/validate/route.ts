// src/app/api/grade-levels/import/validate/route.ts
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

    let companyId = user.companyId
    const formData = await request.formData()
    const companyIdFromForm = formData.get('companyId') as string
    
    if (!companyId && user.role === 'SUPER_ADMIN') {
      companyId = companyIdFromForm
      if (!companyId) {
        return withCors(ApiResponse.error('Company ID required for SUPER_ADMIN', 400), origin)
      }
    }
    
    if (!companyId) {
      return withCors(ApiResponse.error('No company access found', 403), origin)
    }

    const file = formData.get('file') as File
    if (!file) {
      throw new Error('No file uploaded')
    }
    
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('#'))
    const rows = lines.slice(1) // Skip header row
    
    // Get existing ranks for validation
    const existingGrades = await prisma.gradeLevel.findMany({
      where: { companyId },
      select: { rank: true, name: true }
    })
    const existingRanks = new Set(existingGrades.map(g => g.rank))
    const existingNames = new Set(existingGrades.map(g => g.name.toLowerCase()))
    
    const preview: any[] = []
    const errors: any[] = []
    let validCount = 0
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.trim()) continue
      
      const [name, rank, steps, basePay, basePayFrequency, autoProgression, progressionTimeline] = row.split(',').map(s => s.trim())
      
      const validationErrors: string[] = []
      
      // Validate name
      if (!name) {
        validationErrors.push('Name is required')
      } else if (existingNames.has(name.toLowerCase())) {
        validationErrors.push('Name already exists in this company')
      }
      
      // Validate rank
      const rankNum = parseInt(rank)
      if (!rank || isNaN(rankNum)) {
        validationErrors.push('Rank must be a valid number')
      } else if (existingRanks.has(rankNum)) {
        validationErrors.push('Rank already exists in this company')
      }
      
      // Validate steps
      const stepsNum = parseInt(steps)
      if (!steps || isNaN(stepsNum) || stepsNum < 1 || stepsNum > 20) {
        validationErrors.push('Steps must be between 1 and 20')
      }
      
      // Validate base pay frequency
      const validFrequencies = ['Yearly', 'Monthly', 'BiWeekly']
      if (basePayFrequency && !validFrequencies.includes(basePayFrequency)) {
        validationErrors.push('Base Pay Frequency must be Yearly, Monthly, or BiWeekly')
      }
      
      const isValid = validationErrors.length === 0
      
      if (isValid) {
        validCount++
        preview.push({
          name,
          rank: rankNum,
          steps: stepsNum,
          basePay: basePay || 'Not set',
          basePayFrequency: basePayFrequency || 'Monthly',
          autoProgression: autoProgression || 'true',
          progressionTimeline: progressionTimeline || '12',
          status: 'Ready',
          type: 'valid'
        })
      } else {
        errors.push({
          row: i + 2,
          errors: validationErrors,
          data: { name, rank, steps, basePay, basePayFrequency }
        })
        
        preview.push({
          name: name || '--',
          rank: rank || '--',
          steps: steps || '--',
          status: validationErrors.join(', '),
          type: 'error'
        })
      }
    }
    
    // Store validated data in memory (in production, use Redis or database)
    const sessionId = `import_${Date.now()}_${user.userId}`
    ;(global as any)._importSessions = (global as any)._importSessions || {}
    ;(global as any)._importSessions[sessionId] = {
      data: preview.filter(p => p.type === 'valid'),
      companyId,
      userId: user.userId,
      createdAt: Date.now()
    }
    
    return withCors(ApiResponse.success({
      sessionId,
      totalRows: rows.length,
      validCount,
      errorCount: errors.length,
      preview,
      errors: errors.slice(0, 10) // Return first 10 errors
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}