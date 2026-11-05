import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  fbRoute,
  MIN_GROUP,
  OPEN_SIGNAL,
  ACTIVE_CASE,
  mean,
  r1,
  paging,
  fullName,
  EmptyReason,
} from "@/app/lib/fraud-bias";
import { getView } from "@/app/lib/fraud-bias-engine";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/managers?companyId=&cycleId=&q=&risk=&includeClean=&page=&pageSize=
// bias index and integrity are 0-100 (decision 8); biasScore is index / 10 for the UI.
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const sp = new URL(request.url).searchParams;
    const { page, pageSize, skip } = paging(sp);
    const view = await getView(ctx.companyId, sp.get("cycleId"));
    const basisCycle = view.basis && {
      id: view.basis.id,
      name: view.basis.name,
    };
    if (!view.basis)
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        basisCycle,
        emptyReason: {
          code: "NO_REVIEWS",
          message: "No manager reviews have been submitted yet.",
        } as EmptyReason,
      };

    const cycleId = view.basis.id;
    const [sigs, reviews] = await Promise.all([
      prisma.fairnessSignal.findMany({
        where: {
          companyId: ctx.companyId,
          cycleId,
          status: { in: OPEN_SIGNAL as any },
          managerId: { not: null },
        },
        select: {
          managerId: true,
          category: true,
          severity: true,
          title: true,
        },
      }),
      prisma.managerReview.findMany({
        where: {
          companyId: ctx.companyId,
          cycleId,
          status: "SUBMITTED",
          reviewerId: { not: null },
        },
        select: { reviewerId: true, overallScore: true },
      }),
    ]);
    const team = new Map<string, number[]>();
    for (const r of reviews) {
      if (!team.has(r.reviewerId!)) team.set(r.reviewerId!, []);
      if (r.overallScore != null) team.get(r.reviewerId!)!.push(r.overallScore);
    }
    const bySig = new Map<string, typeof sigs>();
    for (const s of sigs)
      bySig.set(s.managerId!, [...(bySig.get(s.managerId!) ?? []), s]);
    const ids = new Set(bySig.keys());
    if (sp.get("includeClean") === "true")
      for (const [m, sc] of team) if (sc.length >= MIN_GROUP) ids.add(m);

    const staff = await prisma.staffRecord.findMany({
      where: { id: { in: [...ids] }, companyId: ctx.companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        departments: { select: { name: true } },
      },
    });
    const cases = await prisma.fairnessCase.findMany({
      where: {
        companyId: ctx.companyId,
        managerId: { in: [...ids] },
        status: { in: ACTIVE_CASE as any },
      },
      select: { id: true, caseNumber: true, managerId: true },
    });
    const caseBy = new Map(cases.map((c) => [c.managerId!, c]));

    let items = staff.map((s) => {
      const ms = bySig.get(s.id) ?? [];
      const n = (cat: string[], sev: string) =>
        ms.filter((x) => cat.includes(x.category) && x.severity === sev).length;
      const biasIndex = Math.min(
        100,
        40 * n(["BIAS"], "HIGH") + 20 * n(["BIAS"], "MEDIUM"),
      );
      const integrity =
        100 -
        Math.min(
          100,
          30 * n(["FRAUD", "GOVERNANCE"], "HIGH") +
            15 * n(["FRAUD", "GOVERNANCE"], "MEDIUM"),
        );
      const risk = ms.some((x) => x.severity === "HIGH")
        ? "HIGH"
        : ms.length
          ? "MEDIUM"
          : "LOW";
      const scores = team.get(s.id) ?? [];
      const avg = scores.length >= MIN_GROUP ? r1(mean(scores)) : null; // privacy: no average below 5 reports
      const c = caseBy.get(s.id);
      return {
        managerId: s.id,
        name: fullName(s),
        department: s.departments?.name ?? s.department ?? null,
        team: scores.length,
        avgScore: avg,
        avgScoreFive: avg == null ? null : r1(avg / 20),
        biasIndex,
        biasScore: r1(biasIndex / 10),
        integrity,
        risk,
        flags: [...new Set(ms.map((x) => x.title))],
        openSignalCount: ms.length,
        activeCase: c ? { id: c.id, caseRef: `FB-${c.caseNumber}` } : null,
      };
    });
    const q = sp.get("q")?.toLowerCase();
    if (q)
      items = items.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.department ?? "").toLowerCase().includes(q) ||
          m.flags.some((f) => f.toLowerCase().includes(q)),
      );
    const risk = sp.get("risk")?.toUpperCase();
    if (risk) items = items.filter((m) => m.risk === risk);
    const rank: any = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    items.sort(
      (a, b) =>
        rank[b.risk] - rank[a.risk] ||
        b.biasIndex - a.biasIndex ||
        a.name.localeCompare(b.name),
    );

    const total = items.length;
    return {
      items: items.slice(skip, skip + pageSize),
      total,
      page,
      pageSize,
      basisCycle,
      lastScannedAt: view.run?.lastScannedAt ?? null,
      emptyReason: total
        ? null
        : ({
            code: sigs.length ? "FILTERED_OUT" : "NO_SIGNALS",
            message: sigs.length
              ? "No managers match the current filters."
              : `No manager has an open signal in ${view.basis.name}.`,
          } as EmptyReason),
    };
  });
}
