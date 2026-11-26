// PUBLIC (verified new hire): upload the file for a "document upload" checklist task.
//   POST multipart { token, taskId, file } -> stored privately, task goes to HR for review.
// Needs the X-Onboarding-Session header from verify-code. The file type is judged from its bytes.
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { allow, clientIp, limiters } from '@/app/lib/candidate-portal/core'
import { publicOnboardingErrorResponse, PublicOnboardingError, requireOnboardingSession } from '@/app/lib/onboarding/public-access'
import { buildPublicChecklist, loadOwnTask, recordCandidateUpload } from '@/app/lib/onboarding/public-checklist'
import { allowedTypesFor, docSpecFor, taskKindOf } from '@/app/lib/recruitment/onboarding-documents'
import { saveCandidateDoc } from '@/app/lib/recruitment/candidate-doc-storage'
import { detectFileType } from '@/app/lib/storage/private-files'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    if (!(await allow(limiters.window, 60, `onb-upload:ip:${clientIp(request)}`))) {
      return withCors(ApiResponse.error('Too many uploads. Please try again later.', 429), origin)
    }
    const form = await request.formData()
    const ctx = await requireOnboardingSession(request, String(form.get('token') || ''))

    const task = await loadOwnTask(ctx.onboarding.id, String(form.get('taskId') || ''))
    const kind = taskKindOf(task)
    if (!kind.documentKey) throw new PublicOnboardingError('This task does not take a file.', 400)
    const spec = docSpecFor(kind.documentKey, task.title)

    const file = form.get('file')
    if (!file || typeof file === 'string') throw new PublicOnboardingError('Choose a file to upload.', 400)
    if (file.size === 0) throw new PublicOnboardingError('The file is empty.', 400)
    if (file.size > MAX_BYTES) throw new PublicOnboardingError('The file must be 10 MB or smaller.', 400)

    const buffer = Buffer.from(await file.arrayBuffer())
    const detected = detectFileType(buffer, allowedTypesFor(spec.accept))
    if (!detected) {
      const allowed = spec.accept === 'pdf' ? 'a PDF' : spec.accept === 'image' ? 'a JPG, PNG, WEBP or HEIC image' : 'a PDF or an image'
      throw new PublicOnboardingError(`Upload ${allowed}.`, 400)
    }

    const filePath = await saveCandidateDoc(['candidate-docs', ctx.candidate.id, spec.key], file.name, detected.ext, buffer)
    await recordCandidateUpload({
      onboardingId: ctx.onboarding.id,
      companyId: ctx.onboarding.companyId,
      candidateId: ctx.candidate.id,
      documentKey: spec.key,
      type: spec.type,
      filePath,
      fileName: file.name,
    })
    return withCors(
      ApiResponse.success({ tasks: await buildPublicChecklist(ctx.onboarding.id) }, 'Uploaded. HR will review it.', 201),
      origin,
    )
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
