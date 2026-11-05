import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, nameOf, ok, readCtx, readText, writeCtx } from "@/app/lib/pip";
import { getBasis } from "@/app/lib/comparison";
import {
  MAX_REPORTS,
  REPORT_LABELS,
  buildSnapshot,
  notifyReportShared,
  parseReportConfig,
} from "@/app/lib/comparison-report";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const NAME = { select: { id: true, firstName: true, lastName: true } } as const;

// GET /api/comparison/reports?companyId   Saved reports (decision 22): your own, plus shared ones for HR/Admin
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, companyId, staffId } = c.ctx;
    if (!staffId) return ok(origin, { reports: [] });
    const rows = await prisma.comparisonReport.findMany({
      where: {
        companyId,
        status: { not: "ARCHIVED" },
        type: { not: "EMPLOYEE_PROFILE" },
        OR: [
          { createdById: staffId },
          ...(actor.companyWide ? [{ status: "SHARED" as const }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_REPORTS,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        generatedAt: true,
        sharedAt: true,
        createdAt: true,
        createdById: true,
        createdBy: NAME,
        cycle: { select: { id: true, name: true } },
      },
    });
    return ok(origin, {
      reports: rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        typeLabel: REPORT_LABELS[r.type],
        status: r.status,
        cycle: r.cycle,
        generatedAt: r.generatedAt,
        sharedAt: r.sharedAt,
        createdAt: r.createdAt,
        createdBy: nameOf(r.createdBy),
        mine: r.createdById === staffId,
      })),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/comparison/reports
// body: { companyId, type, metrics[], timeframe?, filters?, competencyIds?, staffRecordIds?, cycleId?, title?, share?, sharedNote? }
// Generates and freezes the snapshot. "Export PDF" then calls /:id/export; "Share with HR" sends share:true.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const parsed = parseReportConfig(body, actor);
    if ("error" in parsed) return fail(origin, parsed.error);
    const { config } = parsed;
    const title = readText(body.title, "title", 120, { min: 3 });
    if ("error" in title) return fail(origin, title.error);
    const note = readText(body.sharedNote, "sharedNote", 1000);
    if ("error" in note) return fail(origin, note.error);

    const basis = await getBasis(
      companyId,
      actor,
      typeof body.cycleId === "string" ? body.cycleId : null,
    );
    if ("error" in basis) return fail(origin, basis.error, basis.status);
    if (!basis.cycle)
      return fail(origin, "No completed appraisal results are available", 409);
    if (
      (await prisma.comparisonReport.count({
        where: {
          createdById: staffId,
          status: { not: "ARCHIVED" },
          type: { not: "EMPLOYEE_PROFILE" },
        },
      })) >= MAX_REPORTS
    )
      return fail(
        origin,
        `You can keep at most ${MAX_REPORTS} saved reports. Archive some first`,
        409,
      );

    const snap = await buildSnapshot(companyId, actor, basis, config);
    if ("error" in snap) return fail(origin, snap.error, snap.status);
    const share = body.share === true;
    const finalTitle =
      title.value ?? `${REPORT_LABELS[config.type]} - ${basis.cycle.name}`;
    const now = new Date();

    const report = await prisma.$transaction(async (tx) => {
      const r = await tx.comparisonReport.create({
        data: {
          companyId,
          createdById: staffId,
          cycleId: basis.cycle!.id,
          type: config.type,
          title: finalTitle,
          status: share ? "SHARED" : "GENERATED",
          config: config as any,
          snapshot: snap.snapshot,
          generatedAt: now,
          sharedAt: share ? now : null,
          sharedNote: share ? note.value : null,
        },
        select: { id: true, status: true },
      });
      await tx.comparisonReportHistory.createMany({
        data: [
          {
            reportId: r.id,
            companyId,
            action: "CREATED",
            actorId: staffId,
            newData: {
              type: config.type,
              metrics: config.metrics,
              timeframe: config.timeframe,
            },
          },
          { reportId: r.id, companyId, action: "GENERATED", actorId: staffId },
          ...(share
            ? [
                {
                  reportId: r.id,
                  companyId,
                  action: "SHARED",
                  actorId: staffId,
                },
              ]
            : []),
        ],
      });
      return r;
    });
    if (share)
      await notifyReportShared({
        companyId,
        reportId: report.id,
        actorId: staffId,
        title: finalTitle,
      });
    return ok(
      origin,
      { id: report.id, status: report.status, title: finalTitle },
      share ? "Report shared with HR" : "Report saved",
      201,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
