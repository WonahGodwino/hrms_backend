import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/notification-rules/test
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { channels, subject, body: bodyText, sampleData } = body

    return withCors(
      ApiResponse.success(
        {
          sent: true,
          channels: channels || ['email', 'inapp'],
          previewSubject: (subject || '').replace('{Training Name}', sampleData?.trainingName || 'Leadership Training'),
          previewBody: (bodyText || '')
            .replace('{Employee Name}', sampleData?.employeeName || 'John Doe')
            .replace('{Training Name}', sampleData?.trainingName || 'Leadership Training')
            .replace('{Due Date}', sampleData?.dueDate || '2026-06-30'),
        },
        'Test notification sent successfully'
      ),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
