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

  return ApiResponse.error(message, 500)
}

export const formatCurrency = (amount: number, currency: string = 'NGN'): string => {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const validateStaffId = (staffId: string): boolean => {
  return staffId.length >= 3 && staffId.length <= 20
}
