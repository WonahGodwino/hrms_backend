// src/app/api/docs/route.ts
import { NextRequest } from 'next/server'
import { apiDocs } from '@/app/lib/apiDocs'

export async function GET(_request: NextRequest) {
  return new Response(
    JSON.stringify({
      success: true,
      message: 'HRMS API documentation',
      data: {
        endpoints: apiDocs,
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}
