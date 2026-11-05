import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { resolveRatingBounds } from "@/app/lib/self-appraisal";
import {
  authorize,
  loadCompetencyPosition,
  resolveSubject,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
});

// GET /api/development-plans/analytics?companyId&staffRecordId?
// Props for SkillAnalytics: trendData, competencyData, targetRole, readinessScore,
// capabilityGaps and a rule-based suggestion (not AI). Ratings are normalised to
// percent of each competency's scale maximum.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId } = a.auth;
    const subjectId = await resolveSubject(
      a.auth,
      searchParams.get("staffRecordId"),
    );
    if (!subjectId)
      return withCors(ApiResponse.notFound("Staff record not found"), origin);

    const [position, reviews, plans] = await Promise.all([
      loadCompetencyPosition(companyId, subjectId),
      prisma.managerReview.findMany({
        where: {
          status: "SUBMITTED",
          submittedAt: { not: null },
          participant: { staffRecordId: subjectId, companyId },
        },
        orderBy: { submittedAt: "asc" },
        select: {
          submittedAt: true,
          competencyRatings: {
            where: { rating: { not: null } },
            select: {
              competencyId: true,
              rating: true,
              calibratedRating: true,
            },
          },
        },
      }),
      prisma.developmentPlan.findMany({
        where: { companyId, staffRecordId: subjectId, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          progress: true,
          competencyId: true,
          careerAlignment: true,
        },
      }),
    ]);

    // ---- trend: average normalised rating per month ----
    const ids = Array.from(
      new Set(
        reviews.flatMap((r) => r.competencyRatings.map((c) => c.competencyId)),
      ),
    );
    const bounds = ids.length
      ? await resolveRatingBounds(companyId, ids)
      : null;
    const byMonth = new Map<
      string,
      { label: string; sum: number; n: number }
    >();
    for (const r of reviews) {
      const pcts = r.competencyRatings.map(
        (c) =>
          (((c.calibratedRating ?? c.rating) as number) /
            (bounds?.get(c.competencyId)?.max ?? 5)) *
          100,
      );
      if (!pcts.length) continue;
      const d = r.submittedAt as Date;
      const key = d.toISOString().slice(0, 7);
      const e = byMonth.get(key) ?? { label: monthFmt.format(d), sum: 0, n: 0 };
      e.sum += pcts.reduce((s, x) => s + x, 0) / pcts.length;
      e.n += 1;
      byMonth.set(key, e);
    }
    const trendData = Array.from(byMonth.entries())
      .sort(([x], [y]) => x.localeCompare(y))
      .slice(-8)
      .map(([, e]) => ({
        month: e.label,
        competency: Math.round(e.sum / e.n),
      }));

    // ---- radar: Current vs Required (percent of scale max) ----
    const pct = (v: number, max: number) => Math.round((v / max) * 100);
    const rel = (i: { required: number | null; current: number | null }) =>
      i.required !== null && i.current !== null && i.required > 0
        ? (i.required - i.current) / i.required
        : 0;
    const rated = position.items.filter((i) => i.current !== null);
    const pool = position.hasRequirements
      ? rated.filter((i) => i.required !== null)
      : rated;
    const competencyData = pool
      .slice()
      .sort((x, y) => rel(y) - rel(x)) // biggest gaps first, so the 8-axis cap keeps the interesting ones
      .slice(0, 8)
      .map((i) => ({
        subject: i.name,
        Current: pct(i.current as number, i.max),
        ...(i.required !== null ? { Required: pct(i.required, i.max) } : {}),
      }));

    // ---- capability gaps ----
    const planByComp = new Map<string, (typeof plans)[number]>();
    for (const p of plans)
      if (p.competencyId && !planByComp.has(p.competencyId))
        planByComp.set(p.competencyId, p);
    const planNote = (competencyId: string, name: string) => {
      const p = planByComp.get(competencyId);
      return p
        ? `You already have an active plan for it: "${p.title}" (${p.progress}% complete).`
        : `Add a development plan linked to ${name} to start closing this gap.`;
    };
    const below = position.items
      .filter(
        (i) =>
          i.required !== null && i.current !== null && i.current < i.required,
      )
      .map((i) => ({ i, rel: rel(i) }))
      .sort((x, y) => y.rel - x.rel);
    const unassessed = position.items.filter(
      (i) => i.required !== null && i.current === null,
    );
    const capabilityGaps = [
      ...below.map(({ i, rel: r }) => ({
        title: i.name,
        sub: `Currently ${i.currentLevelName}, role requires ${i.requiredLevelName}`,
        rec: planNote(i.competencyId, i.name),
        color: r >= 0.5 ? "#EF4444" : r >= 0.25 ? "#F59E0B" : "#137FEC",
        kind: "BELOW_REQUIRED" as const,
        competencyId: i.competencyId,
        planId: planByComp.get(i.competencyId)?.id ?? null,
      })),
      ...unassessed.map((i) => ({
        title: i.name,
        sub: `Not assessed yet, role requires ${i.requiredLevelName}`,
        rec: "This competency has not been rated in a manager review yet.",
        color: "#94A3B8",
        kind: "UNASSESSED" as const,
        competencyId: i.competencyId,
        planId: null as string | null,
      })),
    ].slice(0, 5);

    // ---- target role (the stated aspiration) and a rule-based suggestion ----
    const targetRole =
      plans.find((p) => p.careerAlignment?.trim())?.careerAlignment?.trim() ??
      null;
    let suggestion: string | null = null;
    if (below.length)
      suggestion = `Your biggest gap is ${below[0].i.name}. ${planNote(below[0].i.competencyId, below[0].i.name)}`;
    else if (position.readiness !== null)
      suggestion = `You meet or exceed the required level on every assessed competency for your role (${position.readiness}% readiness).`;

    return withCors(
      ApiResponse.success(
        {
          trendData,
          competencyData,
          hasRequirements: position.hasRequirements,
          targetRole,
          roleLabel: position.roleLabel, // readiness is measured against this role's standards
          readinessScore: position.readiness,
          capabilityGaps,
          suggestion,
        },
        "Analytics retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
