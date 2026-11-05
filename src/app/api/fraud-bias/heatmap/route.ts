import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  fbRoute,
  deptNames,
  MIN_GROUP,
  EmptyReason,
} from "@/app/lib/fraud-bias";
import { getView, loadBase, detect } from "@/app/lib/fraud-bias-engine";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/heatmap?companyId=&cycleId=
// cell.level: LOW | MEDIUM | HIGH | INSUFFICIENT (under 5 people) | NOT_ASSESSED (no data for that check)
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const view = await getView(
      ctx.companyId,
      new URL(request.url).searchParams.get("cycleId"),
    );
    const basisCycle = view.basis && {
      id: view.basis.id,
      name: view.basis.name,
    };
    if (!view.basis)
      return {
        rows: [],
        basisCycle,
        minGroup: MIN_GROUP,
        emptyReason: {
          code: "NO_REVIEWS",
          message: "No manager reviews have been submitted yet.",
        } as EmptyReason,
      };
    const { heatmap } = detect(await loadBase(ctx.companyId, view.basis.id));
    const names = await deptNames(heatmap.map((h) => h.departmentId));
    const rows = heatmap
      .map((h) => ({
        ...h,
        department: names.get(h.departmentId) ?? "Unknown",
      }))
      .sort((a, b) => a.department.localeCompare(b.department));
    return {
      rows,
      basisCycle,
      minGroup: MIN_GROUP,
      emptyReason: rows.length
        ? null
        : ({
            code: "NO_DEPARTMENTS",
            message: `No scored reviews with a department in ${view.basis.name}.`,
          } as EmptyReason),
    };
  });
}
