import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { ok, readCtx } from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/people?companyId&search   Active-staff picker (mentor for a Mentorship action)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const tokens = (sp.get("search") ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5);
    const rows = await prisma.staffRecord.findMany({
      where: {
        companyId: c.ctx.companyId,
        isActive: true,
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
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        avatarUrl: true,
      },
    });
    return ok(origin, {
      people: rows.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        roleTitle: r.position,
        avatarUrl: r.avatarUrl,
      })),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
