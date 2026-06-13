import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return withCors(ApiResponse.error('File is required', 400), origin)

    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return withCors(ApiResponse.error('CSV must have header + at least one row', 400), origin)

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const dataRows = lines.slice(1)
    const companyId = user.role === 'SUPER_ADMIN' ? undefined : user.companyId

    let created = 0, skipped = 0

    for (const row of dataRows) {
      const cols = row.split(',').map(c => c.trim().replace(/"/g, ''))
      const obj: any = {}
      headers.forEach((h, i) => { obj[h] = cols[i] || '' })
      const title = obj.title || obj.jobtitle || ''
      const code = obj.code || ''
      if (!title || !code) { skipped++; continue }

      const existing = await (prisma as any).designation.findFirst({ where: { code, companyId: companyId || null } })
      if (existing) { skipped++; continue }

      let gradeLevelId = null
      if (obj.grade) {
        const gradeLevel = await (prisma as any).gradeLevel.findFirst({ where: { name: { equals: obj.grade, mode: 'insensitive' }, companyId } })
        if (gradeLevel) gradeLevelId = gradeLevel.id
      }

      await (prisma as any).designation.create({ data: { companyId, title, code, gradeLevelId, description: obj.description || '', status: 'Active' } })
      created++
    }

    return withCors(ApiResponse.success({ created, skipped }, 'Import processed successfully'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}