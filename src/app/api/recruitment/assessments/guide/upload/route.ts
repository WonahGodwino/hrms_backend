// POST /api/recruitment/assessments/upload-guide
// Upload an evaluation guide (PDF) and return a downloadable URL.
// The URL can then be pasted into the round's evaluationPlan text field.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readPdfUpload } from '@/app/lib/offers/ad-hoc-helpers'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)
    if (file.size > MAX_BYTES)
      return withCors(ApiResponse.error('File exceeds the maximum allowed size of 10MB', 413), origin)

    const pdf = await readPdfUpload(file, { maxBytes: MAX_BYTES })
    if ('error' in pdf)
      return withCors(ApiResponse.error('Only PDF documents are accepted', 415), origin)

    const saved = await prisma.candidateFile.create({
      data: {
        companyId,
        type: 'EVALUATION_GUIDE',
        fileName: pdf.name,
        mimeType: pdf.mime,
        sizeBytes: pdf.size,
        data: new Uint8Array(pdf.buffer),
        createdBy: user.userId || user.email || 'system',
      },
    })

    const url = `/api/recruitment/assessments/guide/${saved.id}`
    return withCors(ApiResponse.success({ url, name: pdf.name, size: pdf.size }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
