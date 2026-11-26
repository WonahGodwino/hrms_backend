// PUBLIC (verified new hire): their onboarding checklist.
//   GET   ?token=...                                -> every task, who does it, and their uploads with review status
//   PATCH { token, taskId, completed }               -> tick or untick one of their own checklist items
//   PATCH { token, taskId, dateOfBirth }             -> answer a date-field task (such as date of birth)
// Needs the X-Onboarding-Session header from verify-code.
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { linkTokenFromQuery, publicOnboardingErrorResponse, PublicOnboardingError, requireOnboardingSession } from '@/app/lib/onboarding/public-access'
import { buildPublicChecklist, loadOwnTask, parseDateOfBirth, recordCandidateDateField, toggleCandidateTask } from '@/app/lib/onboarding/public-checklist'
import { taskKindOf } from '@/app/lib/recruitment/onboarding-documents'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { onboardingTaskUpdateSchema } from '@/app/lib/validation/onboarding-public-schemas'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const ctx = await requireOnboardingSession(request, linkTokenFromQuery(request))
    return withCors(ApiResponse.success({ tasks: await buildPublicChecklist(ctx.onboarding.id) }), origin)
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const body = await readJsonBody(request, onboardingTaskUpdateSchema)
    if (!body.ok) return withCors(ApiResponse.error(body.message, 400), origin)

    if ('dateOfBirth' in body.data) {
      const ctx = await requireOnboardingSession(request, body.data.token)
      const task = await loadOwnTask(ctx.onboarding.id, body.data.taskId)
      if (taskKindOf(task).kind !== 'date') throw new PublicOnboardingError('This task does not take a date.', 400)
      const dateOfBirth = parseDateOfBirth(body.data.dateOfBirth)
      if (!dateOfBirth) throw new PublicOnboardingError('Enter your date of birth (YYYY-MM-DD).', 400)
      await recordCandidateDateField({ onboardingId: ctx.onboarding.id, taskId: task.id, dateOfBirth, metadata: ctx.onboarding.metadata })
      return withCors(ApiResponse.success({ tasks: await buildPublicChecklist(ctx.onboarding.id) }, 'Saved.'), origin)
    }

    const ctx = await requireOnboardingSession(request, body.data.token)
    await toggleCandidateTask(ctx.onboarding.id, body.data.taskId, body.data.completed)
    return withCors(ApiResponse.success({ tasks: await buildPublicChecklist(ctx.onboarding.id) }, 'Checklist updated.'), origin)
  } catch (error) { return withCors(publicOnboardingErrorResponse(error, request), origin) }
}
