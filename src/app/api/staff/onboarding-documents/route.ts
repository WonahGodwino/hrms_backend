// /api/staff/onboarding-documents
//   GET  — a staff member's onboarding documents + progress. STAFF sees their
//          own; HR/ADMIN/SUPER_ADMIN can view any via ?staffId=.
//   POST — a STAFF member uploads one of their own required documents.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { assertStorageQuota } from '@/app/lib/trial/guard'
import { staffOnboardingDocumentKey, uploadDocumentObject, warnObjectNotStored } from '@/app/lib/storage/documents'
import { buildStaffDocumentProgress, isStaffDocumentCategory, STAFF_DOCUMENT_CATEGORIES, STAFF_DOCUMENT_LABELS } from '@/app/lib/staff/staff-documents'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const MAX_BYTES = 10 * 1024 * 1024

// Resolves the staff record for the current user (their own).
async function resolveOwnStaff(user: any) {
  let staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { id: true, companyId: true } })
  if (!staff && user.email && user.companyId) {
    staff = await prisma.staffRecord.findFirst({ where: { email: user.email, companyId: user.companyId }, select: { id: true, companyId: true } })
  }
  return staff
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])
    const requestedStaffId = new URL(request.url).searchParams.get('staffId')

    let staffId: string
    if (user.role === 'STAFF') {
      const own = await resolveOwnStaff(user)
      if (!own) return withCors(ApiResponse.error('Staff record not found', 404), origin)
      staffId = own.id
    } else {
      if (!requestedStaffId) return withCors(ApiResponse.error('staffId is required', 400), origin)
      const target = await prisma.staffRecord.findUnique({ where: { id: requestedStaffId }, select: { id: true, companyId: true } })
      if (!target) return withCors(ApiResponse.error('Staff record not found', 404), origin)
      if (user.role !== 'SUPER_ADMIN' && user.companyId && target.companyId !== user.companyId) {
        return withCors(ApiResponse.error('You do not have access to this staff member', 403), origin)
      }
      staffId = target.id
    }

    const docs = await prisma.staffOnboardingDocument.findMany({
      where: { staffId },
      select: { id: true, category: true, fileName: true, sizeBytes: true, mimeType: true, updatedAt: true },
    })

    return withCors(ApiResponse.success({ staffId, progress: buildStaffDocumentProgress(docs) }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    // Uploading is a staff-only feature (each staff uploads their own documents).
    const user = await requireRoleAsync(token, ['STAFF'])
    const staff = await resolveOwnStaff(user)
    if (!staff) return withCors(ApiResponse.error('Staff record not found', 404), origin)

    const formData = await request.formData()
    const category = String(formData.get('category') || '').trim().toUpperCase()
    const file = formData.get('file') as File | null

    if (!isStaffDocumentCategory(category)) {
      return withCors(ApiResponse.error(`category must be one of: ${STAFF_DOCUMENT_CATEGORIES.join(', ')}`, 400), origin)
    }
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)
    if (file.size > MAX_BYTES) return withCors(ApiResponse.error('File exceeds the 10MB limit', 413), origin)

    // Free trial: 200 MB of documents per company.
    await assertStorageQuota(staff.companyId, file.size)

    const buffer = Buffer.from(await file.arrayBuffer())

    const saved = await prisma.staffOnboardingDocument.upsert({
      where: { staffId_category: { staffId: staff.id, category } },
      update: {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        data: new Uint8Array(buffer),
        uploadedBy: user.userId,
      },
      create: {
        companyId: staff.companyId,
        staffId: staff.id,
        category,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        data: new Uint8Array(buffer),
        uploadedBy: user.userId,
      },
    })

    await uploadDocumentObject(
      staffOnboardingDocumentKey(staff.companyId, saved.id),
      buffer,
      (key) => prisma.staffOnboardingDocument.update({ where: { id: saved.id }, data: { s3Key: key } }),
      file.type || 'application/octet-stream',
    ).catch(warnObjectNotStored('staff document', saved.id))

    // Progress for this staff member only.
    const docs = await prisma.staffOnboardingDocument.findMany({
      where: { staffId: staff.id },
      select: { id: true, category: true, fileName: true, sizeBytes: true, mimeType: true, updatedAt: true },
    })

    return withCors(ApiResponse.success({
      documentId: saved.id,
      category,
      progress: buildStaffDocumentProgress(docs),
    }, `${STAFF_DOCUMENT_LABELS[category]} uploaded successfully.`, 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
