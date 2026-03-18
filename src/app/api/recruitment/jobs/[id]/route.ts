// src/app/api/recruitment/jobs/[id]/route.ts
import { NextRequest } from 'next/server'
import { handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

