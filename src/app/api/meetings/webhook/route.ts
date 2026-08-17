// POST /api/meetings/webhook — receives signed LiveKit server events (not
// browser-facing, no CORS/auth-header handling needed beyond LiveKit's own
// webhook signature). Configure in infra/livekit/livekit.yaml's `webhook.urls`.
//
// We only act on egress (recording) lifecycle events: `recordingUrl` used to
// be guessed at start time, before the file even existed — this is what
// actually confirms a recording finished (or failed) and where it landed.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verifyLiveKitWebhook } from '@/app/lib/meetings/provider'

export async function POST(req: NextRequest) {
  // Signature covers the exact raw bytes — must read as text, not req.json().
  const body = await req.text()
  const authHeader = req.headers.get('authorization')
  const event = await verifyLiveKitWebhook(body, authHeader)
  if (!event) return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })

  try {
    if (event.event === 'egress_ended' || event.event === 'egress_updated') {
      const info: any = event.egressInfo
      const egressId = info?.egressId
      if (!egressId) return NextResponse.json({ ok: true })

      const meeting = await (prisma as any).meeting.findFirst({ where: { recordingEgressId: egressId } })
      if (!meeting) return NextResponse.json({ ok: true }) // unrelated/unknown egress, ignore

      const status = String(info?.status || '')
      if (/COMPLETE/i.test(status)) {
        const fileResult = (info?.fileResults || [])[0]
        await (prisma as any).meeting.update({
          where: { id: meeting.id },
          data: {
            recordingStatus: 'READY',
            recordingKey: fileResult?.filename || meeting.recordingKey,
          },
        })
      } else if (/FAILED|ABORT/i.test(status)) {
        await (prisma as any).meeting.update({
          where: { id: meeting.id },
          data: { recordingStatus: 'FAILED' },
        })
      }
      // Other statuses (STARTING/ACTIVE/ENDING) are transient — no DB change needed.
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[meetings webhook] handling failed', e)
    // Ack anyway — LiveKit retries on non-2xx, and a bug here shouldn't wedge egress delivery.
    return NextResponse.json({ ok: true })
  }
}
