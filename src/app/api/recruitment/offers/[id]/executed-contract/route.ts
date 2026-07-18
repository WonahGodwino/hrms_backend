// POST /api/recruitment/offers/:id/executed-contract
// Stores the signed/executed contract PDF for a dispatched offer, marks the offer
// ACCEPTED, keeps the pipeline application aligned (HIRED), and — unless the caller
// opts out — creates the onboarding record so the hire flows into the Command Center.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { promises as fs } from 'fs'
import * as path from 'path'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

// GET /api/recruitment/offers/:id/executed-contract — download the signed PDF.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const offer = await prisma.offer.findFirst({
      where: { id, companyId },
      select: { id: true, executedPdfPath: true },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)
    if (!offer.executedPdfPath) {
      return withCors(ApiResponse.error('No executed contract has been uploaded for this offer', 404), origin)
    }

    const fullPath = path.join(process.cwd(), 'public', offer.executedPdfPath)
    const buffer = await fs.readFile(fullPath).catch(() => null)
    if (!buffer) return withCors(ApiResponse.error('Executed contract file not found', 404), origin)

    return withCors(
      new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="executed-contract-${offer.id}.pdf"`,
          'Cache-Control': 'no-store',
        },
      }),
      origin,
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    // For POST: parse formData first to extract companyId from the global selector.
    const formData = await request.formData()
    const formCompanyId = (formData.get('companyId') as string | null) || undefined
    const effectiveCompanyId = formCompanyId || new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!effectiveCompanyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const offer = await prisma.offer.findFirst({ where: { id, companyId: effectiveCompanyId } })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)
    if (!['APPROVED', 'AWAITING_SIGNATURE', 'SENT', 'ACCEPTED'].includes(offer.status)) {
      return withCors(ApiResponse.error('This offer has not been dispatched for signature yet', 400), origin)
    }

    const file = formData.get('file') as File | null
    const initiateOnboarding = String(formData.get('initiateOnboarding') ?? 'true') !== 'false'
    if (!file) return withCors(ApiResponse.error('No file uploaded', 400), origin)

    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const isPdf = ext === 'pdf' || file.type === 'application/pdf'
    if (!isPdf) return withCors(ApiResponse.error('The executed contract must be a PDF', 400), origin)

    // Persist the file under public/ (same convention as other uploads).
    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadDir = path.join(process.cwd(), 'public', 'offers', 'executed', offer.id)
    await fs.mkdir(uploadDir, { recursive: true })
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${Date.now()}_${safeName}`
    await fs.writeFile(path.join(uploadDir, fileName), buffer)
    const relativePath = `/offers/executed/${offer.id}/${fileName}`

    const now = new Date()
    const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}

    await prisma.offer.update({
      where: { id },
      data: {
        executedPdfPath: relativePath,
        status: 'ACCEPTED',
        acceptedAt: offer.acceptedAt || now,
        updatedBy: actor,
        metadata: { ...meta, respondedAt: now.toISOString(), displayStatus: 'Accepted' } as any,
      },
    })

    // Keep the pipeline application status aligned with the accepted outcome.
    if (offer.applicationId) {
      await prisma.jobApplication.update({
        where: { id: offer.applicationId },
        data: { status: 'HIRED', updatedBy: actor },
      }).catch(() => {})
    }

    // Create (or reuse) the onboarding record so the hire appears in the Command Center.
    let onboardingId: string | null = null
    if (initiateOnboarding) {
      const existing = await prisma.onboarding.findUnique({ where: { offerId: offer.id } }).catch(() => null)
      if (existing) {
        onboardingId = existing.id
      } else {
        const onboarding = await prisma.onboarding.create({
          data: {
            companyId: effectiveCompanyId,
            offerId: offer.id,
            status: 'IN_PROGRESS',
            startDate: offer.proposedStartDate || now,
            createdBy: actor,
          },
        })
        onboardingId = onboarding.id
      }
    }

    return withCors(ApiResponse.success({
      offerId: offer.id,
      status: 'ACCEPTED',
      executedPdf: relativePath,
      onboardingId,
    }, initiateOnboarding
      ? 'Executed contract saved. Offer accepted and onboarding initiated.'
      : 'Executed contract saved. Offer accepted.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
