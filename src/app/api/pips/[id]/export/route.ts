import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { buildPipPdf } from "@/app/lib/pip-export";
import {
  canAccessPip,
  isoDate,
  logPip,
  nameOf,
  notFound,
  pipLabel,
  writeCtx,
} from "@/app/lib/pip";

export const runtime = "nodejs"; // pdfkit needs Node APIs

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const NAME = { select: { firstName: true, lastName: true } } as const;

// GET /api/pips/:id/export?companyId=...   (decision 46). Writes an EXPORTED history row.
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await writeCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const pip = await prisma.pip.findFirst({
      where: { id, companyId },
      include: {
        staffRecord: NAME,
        manager: NAME,
        milestones: {
          where: { removedAt: null },
          orderBy: [{ dueDate: "asc" }, { displayOrder: "asc" }],
        },
        sessions: {
          where: { status: { not: "CANCELLED" } },
          orderBy: { scheduledAt: "asc" },
        },
        escalations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!pip || !canAccessPip(actor, pip)) return notFound(origin);
    const me = await prisma.staffRecord.findUnique({
      where: { id: staffId },
      select: { firstName: true, lastName: true },
    });
    const esc = pip.escalations[0];

    const pdf = await buildPipPdf({
      label: pipLabel(pip.number),
      status: pip.status,
      outcome: pip.outcome,
      employee: nameOf(pip.staffRecord) ?? "",
      role: pip.roleTitle,
      department: pip.departmentName,
      manager: nameOf(pip.manager),
      startDate: isoDate(pip.startDate),
      targetDate: isoDate(pip.targetDate),
      originalTargetDate: pip.originalTargetDate
        ? isoDate(pip.originalTargetDate)
        : null,
      categories: pip.categories,
      issueSummary: pip.issueSummary,
      objectives: pip.objectives,
      closureNote: pip.closureNote,
      milestones: pip.milestones.map((m) => ({
        title: m.title,
        due: isoDate(m.dueDate),
        status: m.status,
        note: m.completionNote,
      })),
      sessions: pip.sessions.map((s) => ({
        when:
          s.scheduledAt.toISOString().slice(0, 16).replace("T", " ") + " UTC",
        status: s.status,
        objectives: s.objectives,
        notes: s.notes,
      })),
      escalation: esc && {
        severity: esc.severity,
        status: esc.status,
        raisedOn: isoDate(esc.createdAt),
        reason: esc.reason,
        nextSteps: esc.recommendedNextSteps,
        resolution: esc.resolutionNote,
      },
      generatedBy: nameOf(me) ?? "Unknown",
      generatedAt:
        new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    });
    await logPip(prisma, {
      pipId: id,
      companyId,
      action: "EXPORTED",
      actorId: staffId,
      newData: { format: "pdf" },
    });

    return withCors(
      new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${pipLabel(pip.number)}.pdf"`,
          "Cache-Control": "no-store",
        },
      }),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
