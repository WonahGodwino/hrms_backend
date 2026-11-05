// src/app/lib/utils.ts
import { NextResponse } from 'next/server'

export class ApiResponse {
  static success(data: any, message: string = 'Success', status: number = 200) {
    return NextResponse.json(
        {
          success: true,
          message,
          data
        },
        { status }
    )
  }

  static error(message: string = 'Error', status: number = 400, errors?: any[], extra?: Record<string, any>) {
    return NextResponse.json(
        {
          success: false,
          message,
          errors: errors || [],
          ...(extra || {}),
        },
        { status }
    )
  }

  static unauthorized(message: string = 'Unauthorized') {
    return this.error(message, 401)
  }

  static forbidden(message: string = 'Forbidden') {
    return this.error(message, 403)
  }

  static notFound(message: string = 'Resource not found') {
    return this.error(message, 404)
  }

  static serverError(message: string = 'Internal server error') {
    return this.error(message, 500)
  }
}

/**
 * Global error formatter — safe, reusable, consistent.
 * Handles unknown, string, Error, and any object type.
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'An unexpected error occurred'
  }
}

export const handleApiError = (error: any) => {
  console.error('API Error:', error)

  const message = formatError(error)

  // Free-trial limits (lib/trial/guard.ts) carry their own status and a code the
  // frontend uses to show the matching upgrade prompt.
  if (error?.name === 'TrialRestrictionError') {
    return ApiResponse.error(message, error.status || 403, undefined, { trialCode: error.code })
  }

  // Auth errors thrown by requireRole / requireAuth → correct HTTP status
  if (message === 'Authentication required' || message === 'Invalid or expired token') {
    return ApiResponse.unauthorized(message)
  }
  if (message.startsWith('Insufficient permissions')) {
    return ApiResponse.forbidden(message)
  }
  if (message === 'JWT_SECRET environment variable is not set') {
    return ApiResponse.serverError('Server configuration error')
  }

  // Prisma validation/query errors dump the full invocation (field names, enum
  // internals, etc.) into `.message` — never forward that raw text to the client.
  if (error?.name === 'PrismaClientValidationError' || /^\s*Invalid `prisma\./.test(message)) {
    return ApiResponse.error('The data provided does not match what was expected. Please check your input and try again.', 400)
  }
  if (error?.name === 'PrismaClientKnownRequestError') {
    return ApiResponse.error('That request could not be completed due to a data conflict. Please try again.', 400)
  }

  return ApiResponse.error(message, 500)
}

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

