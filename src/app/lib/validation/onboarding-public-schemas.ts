// Request bodies for the new hire's public onboarding page (api/recruitment/onboarding/public/*).
import { z } from 'zod'

const token = z.string().trim().min(1, 'token is required')

export const onboardingCodeRequestSchema = z.object({ token })

export const onboardingCodeVerifySchema = z.object({
  token,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const onboardingTaskToggleSchema = z.object({
  token,
  taskId: z.string().trim().min(1, 'taskId is required'),
  completed: z.boolean(),
})

export const onboardingDateFieldSchema = z.object({
  token,
  taskId: z.string().trim().min(1, 'taskId is required'),
  dateOfBirth: z.string().trim().min(1, 'dateOfBirth is required'),
})

/** PATCH .../tasks takes either shape: tick/untick a checklist item, or answer a date-field task. */
export const onboardingTaskUpdateSchema = z.union([onboardingDateFieldSchema, onboardingTaskToggleSchema])

export const onboardingTokenBodySchema = z.object({ token })

export const onboardingAgreeSchema = z.object({ token, confirm: z.literal(true) })
