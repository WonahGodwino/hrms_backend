// src/app/api/payroll/payslip-presets/sample-template/route.ts
//
// Serves the bundled sample payslip preset HTML (recreated from
// docs/payslip-preset-1.pdf). The preset manager uses it to seed a new
// company preset with one click. Public template asset, no sensitive data.
import { NextRequest } from 'next/server'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { ApiResponse } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const filePath = path.join(process.cwd(), 'public', 'payslips', 'presets', 'payslip-preset-1.html')
    const html = fs.readFileSync(filePath, 'utf-8')
    return withCors(ApiResponse.success({ htmlContent: html, name: 'Payslip Preset 1' }, 'Sample template retrieved'), origin)
  } catch (error) {
    console.error('Error reading sample payslip preset:', error)
    return withCors(ApiResponse.error('Sample template not available', 500), origin)
  }
}
