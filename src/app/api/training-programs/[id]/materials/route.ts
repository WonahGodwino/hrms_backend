import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/training-programs/:id/materials
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const program = await prisma.trainingProgram.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ id: params.id }, { slug: params.id }],
      },
      select: { id: true },
    })

    if (!program) {
      return withCors(ApiResponse.error('Training program not found', 404), origin)
    }

    let materialsList: any[] = []
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const rawMaterials = formData.get('materials')
      if (typeof rawMaterials === 'string') {
        materialsList = JSON.parse(rawMaterials)
      }

      // Read files if any
      const files = formData.getAll('files') as File[]

      // Map files to materialsList based on fileIndex or position
      materialsList = materialsList.map((mat, index) => {
        const file = files[mat.fileIndex ?? index]
        if (file && file instanceof File) {
          // Placeholder URL / storage path
          const fileUrl = `/uploads/training/${Date.now()}_${file.name}`
          return {
            ...mat,
            fileUrl,
            fileName: file.name,
            fileSizeBytes: BigInt(file.size),
          }
        }
        return mat
      })
    } else {
      const body = await req.json()
      materialsList = Array.isArray(body.materials) ? body.materials : [body]
    }

    const createdMaterials = await Promise.all(
      materialsList.map((m) =>
        prisma.trainingMaterial.create({
          data: {
            companyId,
            trainingProgramId: program.id,
            title: m.title || 'Untitled Material',
            type: m.type || 'Document',
            source: m.source || (m.url || m.externalUrl ? 'external' : 'upload'),
            fileUrl: m.fileUrl || m.url || null,
            externalUrl: m.externalUrl || m.url || null,
            description: m.description || null,
            studyTimeMinutes: m.studyTime || m.estimatedStudyMinutes || 15,
            fileSizeBytes: m.fileSizeBytes || null,
            createdBy: user.userId,
          },
        })
      )
    )

    const formatted = createdMaterials.map((mat) => ({
      id: mat.id,
      title: mat.title,
      type: mat.type,
      source: mat.source,
      description: mat.description,
      studyTime: mat.studyTimeMinutes,
      url: mat.fileUrl || mat.externalUrl,
      fileName: mat.fileUrl ? mat.title : undefined,
      uploadedAt: mat.createdAt.toISOString(),
    }))

    return withCors(
      ApiResponse.success({ materials: formatted }, 'Training materials saved'),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
