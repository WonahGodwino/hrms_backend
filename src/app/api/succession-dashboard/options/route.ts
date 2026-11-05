import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import {
  EXEC_ROLES,
  LEVEL_LABELS,
  MODULES,
  MODULE_LABELS,
  TIER_LABELS,
  dashCtx,
} from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/options?companyId   Always returns the company's departments, even with no results (decisions 13, 14)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const c = await dashCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { companyId, staffId } = c.ctx;
    const [departments, recipients] = await Promise.all([
      prisma.department.findMany({
        where: { companyId, status: { equals: "Active", mode: "insensitive" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.staffRecord.findMany({
        where: {
          companyId,
          isActive: true,
          role: { in: EXEC_ROLES },
          ...(staffId ? { id: { not: staffId } } : {}),
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        take: 100,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          position: true,
        },
      }),
    ]);
    return ok(origin, {
      departments,
      levels: Object.entries(LEVEL_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      modules: MODULES.map((value) => ({ value, label: MODULE_LABELS[value] })),
      tiers: Object.entries(TIER_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      formats: [
        { value: "pdf", label: "PDF" },
        { value: "csv", label: "CSV" },
      ],
      recipients: recipients.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        role: r.role,
        position: r.position,
      })),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
