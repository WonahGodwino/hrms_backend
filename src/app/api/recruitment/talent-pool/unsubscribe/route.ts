// GET /api/recruitment/talent-pool/unsubscribe?token=...
// One-click unsubscribe from talent-pool job-advert emails. The token is signed
// and scoped (purpose 'talent-pool-unsubscribe'); on success the candidate's
// talentPoolOptOut flag is set and a small confirmation page is returned. No
// auth required — the token itself is the capability.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verifyUnsubscribeToken } from '@/app/lib/talent-pool/token'

function page(title: string, message: string, ok: boolean): NextResponse {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f8;color:#0f172a">
  <div style="max-width:520px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;text-align:center">
    <div style="font-size:40px;margin-bottom:8px">${ok ? '✅' : '⚠️'}</div>
    <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
    <p style="color:#475569;font-size:15px;line-height:1.5;margin:0">${message}</p>
  </div>
</body></html>`
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token') || ''
    const decoded = token ? verifyUnsubscribeToken(token) : null
    if (!decoded) {
      return page('Invalid link', 'This unsubscribe link is invalid or has expired. If you keep receiving emails, contact the company directly.', false)
    }

    const candidate = await prisma.candidate.findFirst({
      where: { id: decoded.candidateId },
      select: { id: true, email: true },
    })
    if (!candidate) {
      return page('Not found', 'We could not find your record. You may already have been removed.', false)
    }

    await (prisma as any).candidate.update({
      where: { id: candidate.id },
      data: { talentPoolOptOut: true },
    })

    return page(
      'You have been unsubscribed',
      'You will no longer receive job-alert emails from this company. You can still apply to any role directly at any time.',
      true,
    )
  } catch {
    return page('Something went wrong', 'We could not process your request. Please try again later.', false)
  }
}
