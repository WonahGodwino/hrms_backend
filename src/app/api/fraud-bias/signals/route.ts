import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  fbRoute,
  csv,
  paging,
  rulesFor,
  OPEN_SIGNAL,
  staffNames,
  deptNames,
} from "@/app/lib/fraud-bias";
import {
  getView,
  signalEmpty,
  serializeSignal,
  SIGNAL_INCLUDE,
} from "@/app/lib/fraud-bias-engine";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/signals?companyId=&cycleId=&status=&category=&severity=&riskCategory=&managerId=&departmentId=&q=&page=&pageSize=
// status defaults to open (OPEN + UNDER_INVESTIGATION); status=ALL lists every status.
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const sp = new URL(request.url).searchParams;
    const view = await getView(ctx.companyId, sp.get("cycleId"));
    const { page, pageSize, skip } = paging(sp);
    const base = {
      items: [],
      total: 0,
      page,
      pageSize,
      basisCycle: view.basis && { id: view.basis.id, name: view.basis.name },
      lastScannedAt: view.run?.lastScannedAt ?? null,
    };
    if (!view.basis) return { ...base, emptyReason: signalEmpty(view, 0, 0) };

    const st = csv(sp.get("status"));
    const where: any = { companyId: ctx.companyId, cycleId: view.basis.id };
    if (!st.includes("ALL"))
      where.status = { in: st.length ? st : OPEN_SIGNAL };
    if (csv(sp.get("category")).length)
      where.category = { in: csv(sp.get("category")) };
    if (csv(sp.get("severity")).length)
      where.severity = { in: csv(sp.get("severity")) };
    if (sp.get("riskCategory"))
      where.ruleKey = { in: rulesFor(sp.get("riskCategory")!.toUpperCase()) };
    if (sp.get("managerId")) where.managerId = sp.get("managerId");
    if (sp.get("departmentId")) where.departmentId = sp.get("departmentId");
    const q = sp.get("q")?.trim();
    if (q)
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
      ];

    const [rows, total] = await Promise.all([
      prisma.fairnessSignal.findMany({
        where,
        include: SIGNAL_INCLUDE,
        orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.fairnessSignal.count({ where }),
    ]);
    const [staff, depts] = await Promise.all([
      staffNames(rows.map((r) => r.managerId)),
      deptNames(rows.map((r) => r.departmentId)),
    ]);
    const anyOpen = total
      ? 1
      : await prisma.fairnessSignal.count({
          where: {
            companyId: ctx.companyId,
            cycleId: view.basis.id,
            status: { in: OPEN_SIGNAL as any },
          },
        });
    return {
      ...base,
      items: rows.map((r) => serializeSignal(r, staff, depts)),
      total,
      emptyReason: signalEmpty(view, total, anyOpen),
    };
  });
}
