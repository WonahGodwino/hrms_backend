// Body schemas for the public auth routes (API-002). They accept exactly what
// the frontend sends today; unknown keys are dropped, wrong types are a 400.
import { z } from 'zod'

const idLike = z.union([z.string(), z.number()]).transform((v) => String(v))

/** Email as typed by the user: any non-empty string (normalised by the route). */
const emailInput = z.string().trim().min(1)

export const loginBodySchema = z.object({
  email: emailInput,
  password: z.string().min(1),
  companyId: idLike.nullish(),
  dropDeviceId: z.string().nullish(),
})

export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().refine((v) => v.includes('@'), 'Valid email address is required'),
})

// The routes below keep their own "required" checks and messages; these
// schemas only make sure every field has the right type before it is used, so
// a number or object where text is expected is a 400, not a crash.
const optionalText = z.string().optional()
const optionalId = idLike.optional()

export const verifyOtpBodySchema = z.object({
  email: optionalText,
  otp: optionalId,
  companyId: idLike.nullish(),
})

export const resetPasswordBodySchema = z.object({
  email: optionalText,
  otp: optionalId,
  newPassword: optionalText,
  confirmPassword: optionalText,
  companyId: idLike.nullish(),
})

export const completeRegistrationBodySchema = z.object({
  email: optionalText,
  staffId: optionalId,
  password: optionalText,
  companyId: idLike.nullish(),
  invite: z.string().nullish(),
})

export const refreshBodySchema = z.object({ refreshToken: z.string().min(1) })

export const changePasswordBodySchema = z.object({
  currentPassword: optionalText,
  newPassword: optionalText,
})
