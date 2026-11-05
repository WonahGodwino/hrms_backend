import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, nameOf, ok, readText } from "@/app/lib/pip";
import {
  LIMITS,
  buildReportSnapshot,
  dashCtx,
  dashWriteCtx,
  parseReportConfig,
} from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const TYPES = ["SUCCESSION_REPORT", "BOARD_PACK"];

// GET /api/succession-dashboard/reports?companyId   Yours, plus those shared with you
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const c = await dashCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { companyId, staffId } = c.ctx;
    if (!staffId) return ok(origin, { reports: [] });
    const rows = await prisma.successionReport.findMany({
      where: {
        companyId,
        status: { not: "ARCHIVED" },
        OR: [{ createdById: staffId }, { sharedWithIds: { has: staffId } }],
      },
      orderBy: { generatedAt: "desc" },
      take: LIMITS.reports,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        generatedAt: true,
        sharedAt: true,
        sharedWithIds: true,
        createdById: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    return ok(origin, {
      reports: rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        status: r.status,
        generatedAt: r.generatedAt,
        sharedAt: r.sharedAt,
        sharedCount: r.sharedWithIds.length,
        createdBy: nameOf(r.createdBy),
        mine: r.createdById === staffId,
      })),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/succession-dashboard/reports
// body: { companyId, type, departmentId?, level?, modules?, title? }. Freezes the snapshot; export is a separate call.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const c = await dashWriteCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { staffId, companyId } = c.ctx;

    if (!TYPES.includes(body.type))
      return fail(origin, `type must be one of: ${TYPES.join(", ")}`);
    const parsed = parseReportConfig(body);
    if ("error" in parsed) return fail(origin, parsed.error);
    const title = readText(body.title, "title", 120, { min: 3 });
    if ("error" in title) return fail(origin, title.error);
    if (
      (await prisma.successionReport.count({
        where: { createdById: staffId, status: { not: "ARCHIVED" } },
      })) >= LIMITS.reports
    )
      return fail(
        origin,
        `You can keep at most ${LIMITS.reports} saved reports. Archive some first`,
        409,
      );

    const snap = await buildReportSnapshot(companyId, parsed.config);
    if ("error" in snap) return fail(origin, snap.error, snap.status);
    const finalTitle =
      title.value ??
      `${body.type === "BOARD_PACK" ? "Board Pack" : "Succession Report"} - ${new Date().toISOString().slice(0, 10)}`;
    const report = await prisma.$transaction(async (tx) => {
      const r = await tx.successionReport.create({
        data: {
          companyId,
          createdById: staffId,
          type: body.type,
          title: finalTitle,
          config: parsed.config as any,
          snapshot: snap.data as any,
        },
        select: { id: true },
      });
      await tx.successionReportHistory.create({
        data: {
          reportId: r.id,
          companyId,
          action: "CREATED",
          actorId: staffId,
          newData: {
            type: body.type,
            modules: parsed.config.modules,
            level: parsed.config.level,
          },
        },
      });
      return r;
    });
    return ok(
      origin,
      { id: report.id, title: finalTitle, type: body.type },
      "Report saved",
      201,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
