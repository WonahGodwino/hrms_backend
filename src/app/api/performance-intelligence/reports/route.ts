import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import path from "path";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import prisma from "@/app/lib/prisma";
import {
  REPORT_ROOT,
  REPORT_SECTIONS,
  SAFE_ID,
  authorizeSuper,
  buildDashboard,
  getSettings,
  listCycles,
  logReportEvent,
  norm,
  resolveRange,
} from "@/app/lib/performance-intelligence/intel-utils";
import { renderReportPdf } from "@/app/lib/performance-intelligence/intel-report";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// POST /api/performance-intelligence/reports
// body: { companyId, type: "EXECUTIVE" | "BOARD", format?: "PDF", rangeKey:
//         "LAST_QUARTER" | "YTD" | "LAST_12_MONTHS", cycleId?, departmentIds?, sections?, title? }
// Generates synchronously and stores the file plus a frozen snapshot of the numbers.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const bad = (m: string, s = 400) => withCors(ApiResponse.error(m, s), origin);
  try {
    const body = await request.json();
    const a = await authorizeSuper(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;
    if (!SAFE_ID.test(companyId)) return bad("Invalid companyId");

    const type = norm(body.type);
    if (type !== "EXECUTIVE" && type !== "BOARD")
      return bad("type must be EXECUTIVE or BOARD");
    const format = norm(body.format || "PDF");
    if (format !== "PDF")
      return bad("Only PDF reports are available right now");
    const rangeKey = norm(body.rangeKey);
    const range = resolveRange(rangeKey);
    if (!range)
      return bad("rangeKey must be LAST_QUARTER, YTD or LAST_12_MONTHS");

    const sections: string[] =
      type === "EXECUTIVE"
        ? [...REPORT_SECTIONS]
        : Array.isArray(body.sections)
          ? body.sections.map(norm)
          : [...REPORT_SECTIONS];
    if (
      !sections.length ||
      sections.some((s) => !(REPORT_SECTIONS as readonly string[]).includes(s))
    )
      return bad(
        `sections must be a non-empty subset of ${REPORT_SECTIONS.join(", ")}`,
      );

    const departmentIds: string[] = Array.isArray(body.departmentIds)
      ? Array.from(
          new Set(
            body.departmentIds.filter(
              (x: unknown): x is string => typeof x === "string",
            ),
          ),
        )
      : [];
    if (departmentIds.length) {
      const n = await prisma.department.count({
        where: { id: { in: departmentIds }, companyId },
      });
      if (n !== departmentIds.length)
        return bad("One or more departments were not found", 404);
    }

    const cycles = await listCycles(companyId);
    const inRange = cycles.filter(
      (c) => c.endDate && c.endDate >= range.start && c.endDate <= range.end,
    );
    const primary =
      (body.cycleId ? cycles.find((c) => c.id === body.cycleId) : null) ??
      inRange.find((c) => c.status === "COMPLETED") ??
      inRange[0] ??
      null;
    if (!primary)
      return bad("No appraisal cycles end in the selected period", 409);

    const settings = await getSettings(companyId);
    const title =
      (typeof body.title === "string" && body.title.trim().slice(0, 150)) ||
      `${type === "BOARD" ? "Board" : "Executive"} Performance Report: ${primary.name}`;

    const report = await prisma.intelligenceReport.create({
      data: {
        companyId,
        type,
        format: "PDF",
        title,
        cycleId: primary.id,
        cycleIds: inRange.map((c) => c.id),
        rangeKey,
        periodStart: range.start,
        periodEnd: range.end,
        departmentIds,
        sections,
        createdById: actorId,
      },
    });

    try {
      const built = await buildDashboard(companyId, primary.id, {
        departmentIds,
        trendMonths: range.months,
      });
      if ("error" in built) throw new Error(built.error);
      const generatedAt = new Date();
      const pdf = await renderReportPdf({
        title,
        type,
        sections,
        generatedAt,
        data: built.data,
      });

      const storagePath = `${companyId}/${randomUUID()}.pdf`;
      const root = path.resolve(REPORT_ROOT);
      const full = path.resolve(root, storagePath);
      if (!full.startsWith(root + path.sep))
        throw new Error("Invalid storage path");
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, pdf, { flag: "wx" });

      const fileName = `${
        title
          .replace(/[^A-Za-z0-9 _-]+/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 80) || "report"
      }.pdf`;
      const ready = await prisma.intelligenceReport.update({
        where: { id: report.id },
        data: {
          status: "READY",
          snapshot: JSON.parse(JSON.stringify(built.data)),
          storagePath,
          fileName,
          sizeBytes: pdf.length,
          generatedAt,
          expiresAt: new Date(
            generatedAt.getTime() + settings.reportRetentionDays * DAY_MS,
          ),
        },
      });
      await logReportEvent({
        reportId: report.id,
        companyId,
        action: "GENERATED",
        actorId,
      });
      return withCors(
        ApiResponse.success(
          {
            id: ready.id,
            title,
            type,
            format: "PDF",
            status: ready.status,
            fileName,
            sizeBytes: ready.sizeBytes,
            generatedAt,
            expiresAt: ready.expiresAt,
          },
          "Report generated successfully",
          201,
        ),
        origin,
      );
    } catch (genError) {
      await prisma.intelligenceReport.update({
        where: { id: report.id },
        data: {
          status: "FAILED",
          error: String((genError as Error).message).slice(0, 500),
        },
      });
      await logReportEvent({
        reportId: report.id,
        companyId,
        action: "GENERATION_FAILED",
        actorId,
      });
      return bad("Report generation failed", 500);
    }
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}