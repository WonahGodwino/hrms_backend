// [ai-assistant] Retention cron — deletes old and orphaned AI conversations.
// Auth: x-cron-secret header must match CRON_SECRET env var.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { handleApiError } from '@/app/lib/utils'
import { recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import { expireDueProposals } from '@/app/lib/ai/proposals'
import { isPlatformEnabled } from '@/app/lib/ai/flags'
import { isCronAuthorized } from '@/app/lib/ai/cronAuth'
import { evaluateCustomRules } from '@/app/lib/core-setup/custom-rules'

const RETENTION_DAYS = 90

export async function POST(request: NextRequest) {
  try {
    if (!isCronAuthorized(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

    // Find what to delete first (ids and companies only), so each company's audit trail records its own deletions.
    const expired = await prisma.aiConversation.findMany({ where: { lastMessageAt: { lt: cutoff } }, select: { id: true, companyId: true } })

    const activeUserIds = await prisma.staffRecord.findMany({
      where: { isActive: true },
      select: { id: true },
    }).then((rows) => rows.map((r) => r.id))

    const expiredIds = new Set(expired.map((c) => c.id))
    const orphans = activeUserIds.length > 0
      ? (await prisma.aiConversation.findMany({ where: { userId: { notIn: activeUserIds } }, select: { id: true, companyId: true } })).filter((c) => !expiredIds.has(c.id))
      : []

    const all = [...expired, ...orphans]
    for (let i = 0; i < all.length; i += 1000) {
      await prisma.aiConversation.deleteMany({ where: { id: { in: all.slice(i, i + 1000).map((c) => c.id) } } })
    }
    const oldResult = { count: expired.length }
    const orphanedCount = orphans.length
    const expiredProposals = await expireDueProposals(prisma)

    // Step 3: the custom automation rules. Only while the feature is on and the platform switch allows it. A failure here must not
    // undo the retention sweep above, and each rule's own failure is recorded as a failed run.
    let customRules: Awaited<ReturnType<typeof evaluateCustomRules>> | { skipped: string } = { skipped: 'AI Assistant is off' }
    if (await isPlatformEnabled(prisma)) {
      customRules = await evaluateCustomRules(prisma).catch(() => ({ skipped: 'The evaluator could not run' }))
    }
    const totalDeleted = oldResult.count + orphanedCount

    // One audit row per affected company (the audit table's companyId is a real company). A failed audit write must not turn a
    // completed sweep into an error.
    const perCompany = new Map<string, { expired: number; orphaned: number }>()
    for (const c of expired) perCompany.set(c.companyId, { expired: (perCompany.get(c.companyId)?.expired ?? 0) + 1, orphaned: perCompany.get(c.companyId)?.orphaned ?? 0 })
    for (const c of orphans) perCompany.set(c.companyId, { expired: perCompany.get(c.companyId)?.expired ?? 0, orphaned: (perCompany.get(c.companyId)?.orphaned ?? 0) + 1 })
    for (const [companyId, n] of perCompany) {
      await recordCoreSetupEvent(prisma, {
        companyId,
        actor: { name: 'Retention Cron', type: 'automation' },
        kind: 'retention',
        area: 'ai',
        action: 'AI conversation retention sweep',
        summary: `Deleted ${n.expired} conversations older than ${RETENTION_DAYS} days and ${n.orphaned} belonging to people who no longer have access.`,
      }).catch(() => null)
    }
    return NextResponse.json({
      success: true,
      deleted: { expired: oldResult.count, orphaned: orphanedCount, total: totalDeleted },
      proposalsExpired: expiredProposals,
      customRules,
    })
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 })
  }
}
