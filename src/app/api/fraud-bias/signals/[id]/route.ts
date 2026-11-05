import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute, httpErr, staffNames, deptNames } from "@/app/lib/fraud-bias";
import { serializeSignal, SIGNAL_INCLUDE } from "@/app/lib/fraud-bias-engine";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/signals/:id?companyId=
// Process rules (bulk submission, duplicates, mismatches) also list the affected employees; group rules never do.
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, {}, async (ctx) => {
    const { id } = await context.params;
    const s: any = await prisma.fairnessSignal.findFirst({
      where: { id, companyId: ctx.companyId },
      include: {
        ...SIGNAL_INCLUDE,
        history: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!s) throw httpErr(404, "Signal not found");
    const ids: string[] = Array.isArray(s.evidence?.affectedStaffIds)
      ? s.evidence.affectedStaffIds.slice(0, 25)
      : [];
    const [staff, depts] = await Promise.all([
      staffNames([s.managerId, ...ids]),
      deptNames([s.departmentId]),
    ]);
    return {
      ...serializeSignal(s, staff, depts),
      affectedEmployees: ids.map((x) => ({
        id: x,
        name: staff.get(x) ?? "Unknown",
      })),
      dismissal: s.dismissedAt
        ? { at: s.dismissedAt, by: s.dismissedByName, note: s.dismissalNote }
        : null,
      history: s.history.map((h: any) => ({
        id: h.id,
        action: h.action,
        actorName: h.actorName,
        createdAt: h.createdAt,
      })),
    };
  });
}
