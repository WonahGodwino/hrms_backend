import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { ok, readCtx } from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/pips/eligible-employees?companyId=...&search=...
// Direct reports (everyone for HR/ADMIN) who are active, not the actor, and have no open PIP (decision 12).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId, staffId } = c.ctx;

    const tokens = (sp.get("search") ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5);
    const where: Prisma.StaffRecordWhereInput = {
      companyId,
      isActive: true,
      pipsAsSubject: { none: { openKey: { not: null } } },
      ...(staffId ? { id: { not: staffId } } : {}),
      ...(actor.companyWide
        ? {}
        : actor.staffRecordId
          ? { managerId: actor.staffRecordId }
          : { id: { in: [] } }),
      ...(tokens.length
        ? {
            AND: tokens.map((tk) => ({
              OR: [
                { firstName: { contains: tk, mode: "insensitive" as const } },
                { lastName: { contains: tk, mode: "insensitive" as const } },
                { staffId: { contains: tk, mode: "insensitive" as const } },
              ],
            })),
          }
        : {}),
    };
    const rows = await prisma.staffRecord.findMany({
      where,
      take: 200,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        department: true,
        avatarUrl: true,
        departments: { select: { name: true } },
        designation: { select: { title: true } },
      },
    });
    return ok(origin, {
      employees: rows.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        avatarUrl: r.avatarUrl,
        roleTitle: r.designation?.title ?? r.position,
        departmentName: r.departments?.name ?? r.department ?? null,
      })),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
