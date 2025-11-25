import { NextResponse } from 'next/server'

export class ApiResponse {
  static success(data: any, message: string = 'Success', status: number = 200) {
    return NextResponse.json({
      success: true,
      message,
      data
    }, { status })
  }

  static error(message: string = 'Error', status: number = 400, errors?: any[]) {
    return NextResponse.json({
      success: false,
      message,
      errors: errors || []
    }, { status })
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

export const handleApiError = (error: any) => {
  console.error('API Error:', error)

  if (error instanceof Error) {
    return ApiResponse.error(error.message)
  }

  return ApiResponse.serverError()
}

export const formatCurrency = (amount: number): string => {
  return `₦${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`
}

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const validateStaffId = (staffId: string): boolean => {
  return staffId.length >= 3 && staffId.length <= 20
}