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

    const preview: any[] = []
    let validCount = 0, errorCount = 0

    for (const row of dataRows) {
      const cols = row.split(',').map(c => c.trim().replace(/"/g, ''))
      const obj: any = {}
      headers.forEach((h, i) => { obj[h] = cols[i] || '' })

      const title = obj.title || obj.jobtitle || ''
      const code = obj.code || ''
      const errors: string[] = []

      if (!title) errors.push('Missing title')
      if (!code) errors.push('Missing code')

      if (errors.length === 0 && code) {
        const existing = await (prisma as any).designation.findFirst({ where: { code, companyId: companyId || null } })
        if (existing) errors.push(`Code "${code}" already exists`)
      }

      if (errors.length > 0) {
        errorCount++
        preview.push({ title: title || '—', code: code || '—', grade: obj.grade || '—', status: errors.join(', '), type: 'error' })
      } else {
        validCount++
        preview.push({ title, code, grade: obj.grade || '—', status: 'Ready', type: 'valid' })
      }
    }

    return withCors(ApiResponse.success({ totalRows: dataRows.length, validCount, errorCount, preview }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}