// GET /api/phed/approvals/memos/:id/email-action?token=...
//
// Public, token-authenticated endpoint (no login) so the MD/CEO can approve or
// reject the final approval directly from the email they received. The signed
// token IS the credential and encodes the decision.

import { NextRequest, NextResponse } from 'next/server'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { verifyEmailActionToken } from '@/app/lib/phed/email-action-token'
import { applyEmailDecision } from '@/app/lib/phed/approval-email-actions'

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': req.headers.get('origin') ?? '*' },
  })
}

function htmlPage(title: string, message: string, ok: boolean): NextResponse {
  const color = ok ? '#16a34a' : '#dc2626'
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title></head>
<body style="margin:0;background:#f4f6fa;font-family:'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(17,24,39,0.08);padding:40px 48px;max-width:520px;text-align:center;">
    <div style="font-size:40px;line-height:1;">${ok ? '&#9989;' : '&#10060;'}</div>
    <h1 style="margin:16px 0 8px;font-size:22px;color:#111827;">${title}</h1>
    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.7;">${message}</p>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">You can close this window. This confirmation is from the 24/7HR Platform.</p>
  </div>
</body></html>`
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const rl = phedRateLimit(req, 'write')
  if (rl) {
    return htmlPage('Too many requests', 'Please wait a moment and try the link again.', false)
  }

  try {
    const token = new URL(req.url).searchParams.get('token') ?? ''
    const payload = verifyEmailActionToken(token)
    if (!payload || payload.memoId !== params.id) {
      return htmlPage('Invalid or expired link', 'This approval link is invalid or has expired. Please ask the HR/Admin to resend the approval email.', false)
    }

    const result = await applyEmailDecision(params.id, payload.decision)
    if (!result.ok) {
      return htmlPage('Action unavailable', result.message, false)
    }

    if (result.decision === 'approve') {
      return htmlPage(
        'Approval recorded',
        'Your final approval has been recorded. The payroll approval memo is now fully approved and the pay period has been locked.',
        true,
      )
    }
    return htmlPage(
      'Memo rejected',
      'The payroll approval memo has been rejected and returned to Stage 1 for correction.',
      true,
    )
  } catch (e) {
    console.error('[PHED EMAIL ACTION] failed:', e)
    return htmlPage('Something went wrong', 'An unexpected error occurred. Please try again or contact HR/Admin.', false)
  }
}
