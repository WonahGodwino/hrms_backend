import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { nameOf, ok } from "@/app/lib/pip";
import { guarded } from "@/app/lib/pip-employee";
import { AUTO_LIMITS, automationReadCtx } from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/staff?companyId=...&search=...  (employee picker for Test Rule)
export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const ctx = await automationReadCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    const tokens = (request.nextUrl.searchParams.get("search") ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5);
    const staff = await prisma.staffRecord.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        ...(tokens.length
          ? {
              AND: tokens.map((tk) => ({
                OR: [
                  { firstName: { contains: tk, mode: "insensitive" as const } },
                  { lastName: { contains: tk, mode: "insensitive" as const } },
                ],
              })),
            }
          : {}),
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: AUTO_LIMITS.staffResults,
      select: { id: true, firstName: true, lastName: true, position: true },
    });
    return ok(
      origin,
      staff.map((s) => ({ id: s.id, name: nameOf(s), role: s.position })),
    );
  });
}
