import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { PRIVACY_MIN_PEOPLE, ok, pipScope, readCtx } from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const LABELS: Record<string, string> = {
  PRODUCTIVITY_OUTPUT: "Productivity",
  SKILL_GAP: "Skill Gap",
  ATTENDANCE_POLICY: "Attendance",
  BEHAVIOR_CONDUCT: "Behavior",
};

// GET /api/pips/analytics?companyId=...&departmentId=...  (decisions 43, 44)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const departmentId = sp.get("departmentId");
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();

    const pips = await prisma.pip.findMany({
      where: {
        companyId,
        ...pipScope(actor),
        activatedAt: { not: null },
        ...(departmentId ? { departmentId } : {}),
      },
      take: 3000,
      select: {
        staffRecordId: true,
        activatedAt: true,
        closedAt: true,
        categories: true,
        kpiSnapshots: {
          orderBy: { capturedAt: "asc" },
          select: { kpiScore: true, capturedAt: true },
        },
      },
    });
    const gate = actor.companyWide; // managers see their own reports with no threshold (decision 14)

    // Trend: trailing 6 UTC months, latest snapshot on/before month end carried forward per PIP
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(Date.UTC(y, m - i, 1));
      const end = i === 0 ? now : new Date(Date.UTC(y, m - i + 1, 1) - 1);
      const values: number[] = [];
      const people = new Set<string>();
      for (const p of pips) {
        if (p.activatedAt! > end || (p.closedAt && p.closedAt < start))
          continue;
        const snap = [...p.kpiSnapshots]
          .reverse()
          .find((s) => s.capturedAt <= end);
        if (!snap) continue;
        values.push(snap.kpiScore);
        people.add(p.staffRecordId);
      }
      const suppressed =
        values.length > 0 && gate && people.size < PRIVACY_MIN_PEOPLE;
      trend.push({
        month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
        value:
          values.length && !suppressed
            ? Math.round(
                (values.reduce((a, b) => a + b, 0) / values.length) * 10,
              ) / 10
            : null,
        contributors: suppressed ? null : values.length,
        suppressed,
      });
    }

    // Root causes: PIPs activated this year, one unit spread across its categories
    const year = pips.filter(
      (p) =>
        p.activatedAt! >= new Date(Date.UTC(y, 0, 1)) && p.categories.length,
    );
    const people = new Set(year.map((p) => p.staffRecordId));
    const rootSuppressed = gate && people.size < PRIVACY_MIN_PEOPLE;
    const agg = new Map<string, { weight: number; cases: number }>();
    for (const p of year)
      for (const cat of p.categories) {
        const a = agg.get(cat) ?? { weight: 0, cases: 0 };
        a.weight += 1 / p.categories.length;
        a.cases += 1;
        agg.set(cat, a);
      }
    const total = year.length;
    const rootCauses = rootSuppressed
      ? []
      : [...agg.entries()]
          .map(([key, a]) => ({
            key,
            label: LABELS[key] ?? key,
            cases: a.cases,
            sharePct: total ? Math.round((a.weight / total) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.sharePct - a.sharePct);

    return ok(origin, {
      minPeople: PRIVACY_MIN_PEOPLE,
      trend,
      rootCauses: {
        year: y,
        totalCases: rootSuppressed ? null : total,
        suppressed: rootSuppressed,
        reason: rootSuppressed ? "NOT_ENOUGH_DATA" : null,
        series: rootCauses,
      },
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
