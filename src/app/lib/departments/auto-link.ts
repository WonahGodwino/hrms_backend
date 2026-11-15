// src/app/lib/departments/auto-link.ts
//
// "Staff department auto-link" (system automation `sys-dept-link`): whenever a staff record is created, edited, uploaded or
// promoted, its free-text department and position are linked to real Department and Designation records, creating them if
// needed. An Admin can switch this off in Core Setup > Automation; the switch is stored like any rule override
// (automation_rule_settings, ruleId `sys-dept-link`, overrides.status = 'disabled').
//
// Only the AUTOMATIC hooks consult this. A person pressing "Sync from Staff Records", or assigning staff to a department by hand,
// is an explicit action and always runs.
import { prisma } from '@/app/lib/db'

export const AUTO_LINK_RULE_ID = 'sys-dept-link'

// The setting is read on every staff create/edit/upload, and changes rarely, so each server instance remembers it briefly. Switching
// the rule on or off clears this instance's copy at once (invalidateStaffAutoLink, called by the rule route); other instances pick
// the change up within CACHE_MS. A failed read is never cached, and the entry map is bounded so it cannot grow without limit.
const CACHE_MS = 30_000
const CACHE_MAX = 5_000
const cache = new Map<string, { enabled: boolean; expires: number }>()

export function invalidateStaffAutoLink(companyId: string) {
  cache.delete(companyId)
}

export async function isStaffAutoLinkEnabled(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return true
  const hit = cache.get(companyId)
  if (hit && hit.expires > Date.now()) return hit.enabled
  try {
    const row = await prisma.automationRuleSetting.findUnique({
      where: { companyId_ruleId: { companyId, ruleId: AUTO_LINK_RULE_ID } },
      select: { overrides: true },
    })
    const status = (row?.overrides as Record<string, unknown> | null)?.status
    const enabled = status !== 'disabled'
    if (cache.size >= CACHE_MAX) cache.clear()
    cache.set(companyId, { enabled, expires: Date.now() + CACHE_MS })
    return enabled
  } catch (error) {
    // If the setting can't be read, keep the long-standing behaviour (linking on).
    console.error('[AUTO_LINK] Could not read the automation setting:', error)
    return true
  }
}
