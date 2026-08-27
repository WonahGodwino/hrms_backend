// src/app/api/offer-letters/bulk-email/send/route.ts
//
// POST — async bulk-send entrypoint: HR/ADMIN picks any set of already
// *generated* offer letters (regardless of which Word template produced
// each one — sendOfferLetterEmail already substitutes {{variables}} from
// each letter's own variableValues, so mixing source templates in one batch
// just works) plus one optional email template, and every recipient gets a
// real SMTP send. Reuses the same async-job pattern as bulk-create/upload —
// a single request-lifetime loop isn't viable once you're sending to dozens
// of candidates (SMTP round trip per send). Poll
// GET /offer-letters/bulk-jobs/status/[id], same as CREATE/EDIT jobs.
import { NextRequest } from 'next/server'

import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import {
  completeOfferLetterBulkJobRecord,
  createPendingOfferLetterBulkJob,
  failOfferLetterBulkJobRecord,
  getActiveOfferLetterBulkJob,
  type OfferLetterBulkJobResults,
} from '@/app/lib/offer-letters/bulkJobStatus'
import { sendOfferLetterEmail } from '@/app/lib/offer-letters/email/sendEmail'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

// Politeness delay between sends on the one pooled SMTP connection for this
// company's mailbox — sending dozens of emails back-to-back with zero gap
// risks tripping Hostinger's own rate limiting.
const SEND_DELAY_MS = 400

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await request.json()
    const { companyId, letterIds, emailTemplateId }: { companyId?: string; letterIds?: string[]; emailTemplateId?: string | null } = body

    if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)
    if (!letterIds || !Array.isArray(letterIds) || letterIds.length === 0) {
      return withCors(ApiResponse.error('Please select at least one offer letter to email', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const activeJob = await getActiveOfferLetterBulkJob(companyId)
    if (activeJob) {
      return withCors(
        ApiResponse.error('A bulk job is already being processed for this company. Please wait for it to finish before starting another.', 409),
        origin
      )
    }

    // Only letters that actually belong to this company and actually exist —
    // silently drop the rest rather than failing the whole batch over a
    // stale selection (e.g. a letter deleted after the picker loaded).
    const letters = await prisma.generatedOfferLetter.findMany({
      where: { id: { in: letterIds }, companyId },
      select: { id: true },
    })
    if (letters.length === 0) {
      return withCors(ApiResponse.error('None of the selected offer letters were found for this company', 404), origin)
    }

    if (emailTemplateId) {
      const template = await prisma.offerLetterEmailTemplate.findFirst({ where: { id: emailTemplateId, companyId, isActive: true } })
      if (!template) return withCors(ApiResponse.error('Selected email template not found for this company', 404), origin)
    }

    const validLetterIds = letters.map((l) => l.id)

    const job = await createPendingOfferLetterBulkJob(companyId, 'EMAIL_SEND', null, null, user.userId, validLetterIds.length, {
      letterIds: validLetterIds,
      emailTemplateId: emailTemplateId || null,
    })

    // Respond immediately; sends happen one at a time in the background.
    // This process is a long-running Node server, not a serverless
    // function, so the event loop keeps running this work.
    processOfferLetterBulkEmailSendInBackground({
      jobId: job.id,
      companyId,
      letterIds: validLetterIds,
      emailTemplateId: emailTemplateId || null,
      userId: user.userId,
    }).catch((err) => {
      console.error('[OFFER_LETTER_BULK_EMAIL_SEND] Unhandled background processing error:', err)
    })

    return withCors(
      ApiResponse.success({ jobId: job.id, status: 'PROCESSING', totalRecords: validLetterIds.length }, 'Sending — this will continue in the background'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

async function processOfferLetterBulkEmailSendInBackground({
  jobId,
  companyId,
  letterIds,
  emailTemplateId,
  userId,
}: {
  jobId: string
  companyId: string
  letterIds: string[]
  emailTemplateId: string | null
  userId: string
}) {
  const results: OfferLetterBulkJobResults = { successful: 0, failed: 0, errors: [] }

  try {
    for (let index = 0; index < letterIds.length; index++) {
      const letterId = letterIds[index]

      try {
        const emailRow = await sendOfferLetterEmail({
          letterId,
          companyId,
          templateId: emailTemplateId,
          userId,
        })
        if (emailRow.status === 'FAILED') {
          results.failed++
          results.errors.push({ row: index + 1, message: emailRow.errorMessage || 'Failed to send email.', data: { letterId } })
        } else {
          results.successful++
        }
      } catch (err: any) {
        results.failed++
        results.errors.push({ row: index + 1, message: err?.message || 'An error occurred while sending this email.', data: { letterId } })
      }

      if (index < letterIds.length - 1) await sleep(SEND_DELAY_MS)
    }

    await completeOfferLetterBulkJobRecord(jobId, results)

    console.log('[OFFER_LETTER_BULK_EMAIL_SEND] Completed', { jobId, companyId, successful: results.successful, failed: results.failed })
  } catch (processingError: any) {
    console.error('[OFFER_LETTER_BULK_EMAIL_SEND] Processing error:', { jobId, error: processingError })
    await failOfferLetterBulkJobRecord(jobId, processingError.message || 'Unknown processing error')
  }
}
