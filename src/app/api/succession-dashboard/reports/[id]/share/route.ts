import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, readText } from "@/app/lib/pip";
import {
  EXEC_ROLES,
  LIMITS,
  dashWriteCtx,
  notifySuccessionReportShared,
} from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/succession-dashboard/reports/:id/share   body: { companyId, recipientIds[], sharedNote? }   (decision 14)
// In-app only: recipients must be active HR, ADMIN or SUPER_ADMIN staff. Creator only.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const body = await request.json();
    const c = await dashWriteCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { staffId, companyId } = c.ctx;

    const ids: string[] = Array.isArray(body.recipientIds)
      ? [
          ...new Set<string>(
            body.recipientIds.filter(
              (x: unknown) => typeof x === "string" && x !== staffId,
            ),
          ),
        ]
      : [];
    if (!ids.length || ids.length > LIMITS.shareMax)
      return fail(origin, `Choose 1 to ${LIMITS.shareMax} recipients`);
    const note = readText(body.sharedNote, "sharedNote", 1000);
    if ("error" in note) return fail(origin, note.error);

    const r = await prisma.successionReport.findFirst({
      where: {
        id,
        companyId,
        createdById: staffId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true, title: true, sharedWithIds: true },
    });
    if (!r) return notFound(origin, "Report");
    const valid = await prisma.staffRecord.findMany({
      where: {
        id: { in: ids },
        companyId,
        isActive: true,
        role: { in: EXEC_ROLES },
      },
      select: { id: true },
    });
    if (valid.length !== ids.length)
      return fail(
        origin,
        "Recipients must be active HR or administrator users in this company",
      );

    const merged = [...new Set([...r.sharedWithIds, ...ids])];
    await prisma.$transaction(async (tx) => {
      await tx.successionReport.update({
        where: { id },
        data: {
          status: "SHARED",
          sharedWithIds: merged,
          sharedAt: new Date(),
          sharedNote: note.value,
        },
      });
      await tx.successionReportHistory.create({
        data: {
          reportId: id,
          companyId,
          action: "SHARED",
          actorId: staffId,
          newData: { recipientIds: ids },
        },
      });
    });
    await notifySuccessionReportShared({
      companyId,
      reportId: id,
      actorId: staffId,
      title: r.title,
      recipientIds: ids,
    });
    return ok(
      origin,
      { id, status: "SHARED", sharedCount: merged.length },
      "Report shared",
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
