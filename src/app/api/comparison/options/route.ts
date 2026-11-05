import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import { cycleView } from "@/app/lib/promotion";
import {
  BAND_LABELS,
  BAND_VALUES,
  emptyReason,
  getBasis,
  loadPopulation,
  resolveFocus,
} from "@/app/lib/comparison";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/options?companyId&cycleId?   Backs AdvancedFilterModal (decisions 2, 4, 5)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const basis = await getBasis(companyId, actor, sp.get("cycleId"));
    if ("error" in basis) return fail(origin, basis.error, basis.status);

    const [competencies, all, departments] = await Promise.all([
      prisma.competency.findMany({
        where: { companyId, status: "ACTIVE" },
        orderBy: { name: "asc" },
        take: 300,
        select: { id: true, name: true, isLeadership: true },
      }),
      basis.cycle
        ? loadPopulation(companyId, actor, basis.cycle)
        : Promise.resolve([]),
      prisma.department.findMany({
        where: { companyId, status: { equals: "Active", mode: "insensitive" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    const focus = await resolveFocus(companyId, all, []);
    const depts = new Map<string, string>();
    for (const m of all)
      if (m.departmentId && m.departmentName)
        depts.set(m.departmentId, m.departmentName);
    return ok(origin, {
      cycles: basis.list.map(cycleView),
      defaultCycleId: basis.list[0]?.id ?? null,
      cycle: basis.cycle ? cycleView(basis.cycle) : null,
      departments: departments,
      competencies,
      defaultFocusIds: focus.map((f) => f.id),
      bands: BAND_VALUES.map((value) => ({ value, label: BAND_LABELS[value] })),
      emptyReason: await emptyReason(companyId, actor, basis, all.length),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

