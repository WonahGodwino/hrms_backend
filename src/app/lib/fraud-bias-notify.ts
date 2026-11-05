import { createNotification } from "@/app/lib/notifications/helpers"; // match the path pip-notify.ts uses
import { RISK_LABELS, FbCtx } from "@/app/lib/fraud-bias";

// Messages carry the case ref and category only, never names. Recipients get no module access (decision 19).
const note = (c: any) =>
  `${`FB-${c.caseNumber}`} · ${RISK_LABELS[c.riskCategory] ?? c.riskCategory} · ${c.severity}`;

export async function notifyAssigned(ctx: FbCtx, staffId: string, c: any) {
  if (staffId === ctx.actorStaffId) return;
  await createNotification(
    staffId,
    "FAIRNESS_CASE_ASSIGNED",
    "Governance case assigned",
    `You were assigned as investigator on ${note(c)}. Contact a Super Administrator for details.`,
    { caseId: c.id, caseRef: `FB-${c.caseNumber}` },
    ctx.companyId,
  );
}
export async function notifyEscalated(ctx: FbCtx, staffId: string, c: any) {
  if (staffId === ctx.actorStaffId) return;
  await createNotification(
    staffId,
    "FAIRNESS_CASE_ESCALATED",
    "Governance case escalated to you",
    `${note(c)} was escalated for executive review. Contact a Super Administrator for details.`,
    { caseId: c.id, caseRef: `FB-${c.caseNumber}` },
    ctx.companyId,
  );
}
