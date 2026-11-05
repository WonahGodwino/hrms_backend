// [ai-assistant] Terms acceptance. Recorded in the existing audit table (no new column): one event per company and terms version, with
// who accepted and when. Raise TERMS_VERSION when docs/AI_ASSISTANT_TERMS.md changes materially so companies are asked again.
import type { PrismaClient } from '@prisma/client'

export const TERMS_VERSION = '2026-10-29'
export const TERMS_ACTION = 'AI Assistant terms accepted'

type Db = Pick<PrismaClient, 'coreSetupAuditEvent'>

export interface TermsStatus {
  version: string
  accepted: boolean
  acceptedByName: string | null
  acceptedAt: Date | null
}

export async function termsStatus(db: Db, companyId: string): Promise<TermsStatus> {
  const found = await db.coreSetupAuditEvent.findFirst({
    where: { companyId, kind: 'setting', area: 'ai', action: TERMS_ACTION, object: TERMS_VERSION },
    orderBy: { createdAt: 'desc' },
    select: { actorName: true, createdAt: true },
  })
  return { version: TERMS_VERSION, accepted: !!found, acceptedByName: found?.actorName ?? null, acceptedAt: found?.createdAt ?? null }
}
