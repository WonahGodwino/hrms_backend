import { prisma } from "@/app/lib/db";
import { createNotification } from "@/app/lib/notifications/helpers";

// Every active HR or ADMIN of the company: by StaffRecord.role and by UserCompany link. SUPER_ADMIN is not included.
export async function hrRecipientIds(companyId: string): Promise<string[]> {
  const [direct, linked] = await Promise.all([
    prisma.staffRecord.findMany({
      where: {
        companyId,
        isActive: true,
        isBlocked: false,
        role: { in: ["HR", "ADMIN"] },
      },
      select: { id: true },
    }),
    prisma.userCompany.findMany({
      where: {
        companyId,
        role: { in: ["HR", "ADMIN", "ALL"] },
        user: { isActive: true, isBlocked: false },
      },
      select: { userId: true },
    }),
  ]);
  return [
    ...new Set([...direct.map((d) => d.id), ...linked.map((l) => l.userId)]),
  ].slice(0, 50);
}

export async function notifyHrOfWithdrawal(p: {
  companyId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  reason: string;
}) {
  try {
    const ids = await hrRecipientIds(p.companyId);
    await Promise.all(
      ids.map((userId) =>
        createNotification(
          userId,
          "APPLICATION_WITHDRAWN",
          "Candidate withdrew application",
          `${p.candidateName} withdrew their application for ${p.jobTitle}. Reason: ${p.reason}.`,
          {
            applicationId: p.applicationId,
            jobId: p.jobId,
            jobTitle: p.jobTitle,
            candidateName: p.candidateName,
            reason: p.reason,
          },
          p.companyId,
        ),
      ),
    );
  } catch (e) {
    console.error("[candidate-portal] HR notification failed:", e);
  }
}
