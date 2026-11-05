import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { authorize } from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/development-plans/competencies?companyId
// ACTIVE competencies for the pickers. Employee-accessible on purpose: the
// competency framework routes are management-facing.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const rows = await prisma.competency.findMany({
      where: { companyId: a.auth.companyId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, name: true, category: true },
    });
    return withCors(
      ApiResponse.success(rows, "Competencies retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
