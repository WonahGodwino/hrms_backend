// [ai-assistant] Feature flags for the AI Assistant module.
import { PrismaClient } from '@prisma/client'

// Whether the assistant is on is decided per company (AiAssistantSettings.enabled, switched by that company's
// Admin or HR in Settings), under Super Admin's platform-wide kill switch (AiAssistantPlatform). There is no
// server environment flag.

export async function isPlatformEnabled(prisma: PrismaClient): Promise<boolean> {
  const row = await prisma.aiAssistantPlatform.findUnique({ where: { id: 'global' } })
  return row?.enabled ?? true
}

export async function isCompanyEnabled(
  prisma: PrismaClient,
  companyId: string,
): Promise<boolean> {
  const settings = await prisma.aiAssistantSettings.findUnique({ where: { companyId } })
  if (!settings) return false
  return settings.enabled && settings.keyStatus === 'ok'
}
