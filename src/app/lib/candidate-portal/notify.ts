import {
  createNotification,
  NOTIFICATION_TYPES,
} from "@/app/lib/notifications/helpers";
import { forCompany } from '@/app/lib/data/tenant';

// Every active HR or ADMIN of the company: by StaffRecord.role and by UserCompany link. SUPER_ADMIN is not included.
export async function hrRecipientIds(companyId: string): Promise<string[]> {
  const [direct, linked] = await Promise.all([
    forCompany(companyId).staffRecord.findMany({
      where: { isActive: true,
        isBlocked: false,
        role: { in: ["HR", "ADMIN"] },
      },
      select: { id: true },
    }),
    forCompany(companyId).userCompany.findMany({
      where: { role: { in: ["HR", "ADMIN", "ALL"] },
        user: { isActive: true, isBlocked: false },
      },
      select: { userId: true },
    }),
  ]);
  return [
    ...new Set([...direct.map((d) => d.id), ...linked.map((l) => l.userId)]),
  ].slice(0, 50);
}

export async function notifyHrOfApplication(p: {
  companyId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  candidateName: string;
  candidateEmail?: string;
  referenceCode?: string;
}) {
  try {
    const ids = await hrRecipientIds(p.companyId);
    if (!ids.length) return;

    const ref = p.referenceCode
      ? p.referenceCode.includes("-")
        ? p.referenceCode
        : `${p.referenceCode.slice(0, 5)}-${p.referenceCode.slice(5)}`
      : "";

    await Promise.allSettled(
      ids.map((userId) =>
        createNotification(
          userId,
          NOTIFICATION_TYPES.APPLICATION_SUBMITTED,
          "New job application received",
          `${p.candidateName} applied for ${p.jobTitle}${ref ? ` (Ref: ${ref})` : ""}.`,
          {
            applicationId: p.applicationId,
            jobId: p.jobId,
            jobTitle: p.jobTitle,
            candidateName: p.candidateName,
            candidateEmail: p.candidateEmail,
            referenceCode: ref,
            url: `/jobs/${p.jobId}/applicants/${p.applicationId}`,
          },
          p.companyId,
        ),
      ),
    );
  } catch (e) {
    console.error("[candidate-portal] HR application notification failed:", e);
  }
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
    await Promise.allSettled(
      ids.map((userId) =>
        createNotification(
          userId,
          NOTIFICATION_TYPES.APPLICATION_WITHDRAWN,
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
