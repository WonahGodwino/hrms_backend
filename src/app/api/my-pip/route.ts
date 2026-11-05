import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { LIVE_PIP, canAccessPip, ok } from "@/app/lib/pip";
import {
  EMPLOYEE_INCLUDE,
  employeeReadCtx,
  guarded,
  serializeEmployeePlan,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// Own plan by default. A manager or HR user can pass ?staffRecordId= to view an employee they have access to.
export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const sp = request.nextUrl.searchParams;
    const ctx = await employeeReadCtx(request, sp.get("companyId"));
    const targetId = sp.get("staffRecordId") ?? ctx.staffId;
    if (!targetId) return ok(origin, { plan: null });

    const base = { companyId: ctx.companyId, staffRecordId: targetId };
    const pip =
      (await prisma.pip.findFirst({
        where: { ...base, status: { in: LIVE_PIP } },
        include: EMPLOYEE_INCLUDE,
      })) ??
      (await prisma.pip.findFirst({
        where: { ...base, status: "COMPLETED" },
        orderBy: { closedAt: "desc" },
        include: EMPLOYEE_INCLUDE,
      }));
    if (!pip) return ok(origin, { plan: null });

    const isOwner = pip.staffRecordId === ctx.staffId;
    if (!isOwner && !canAccessPip(ctx.actor, pip))
      return ok(origin, { plan: null });
    const drafts = isOwner
      ? await prisma.pipProgressDraft.findMany({
          where: { pipId: pip.id, staffRecordId: ctx.staffId as string },
        })
      : [];
    return ok(origin, {
      plan: serializeEmployeePlan(pip, { isOwner, now: new Date(), drafts }),
    });
  });
}
