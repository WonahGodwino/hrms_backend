import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { VALID_QUESTION_TYPES } from "@/app/lib/review-templates/question-bank-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/review-templates/question-bank/summary?companyId=xxx
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId) {
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    }
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const [byType, byCategory, archived, useRows] = await Promise.all([
      prisma.questionBankItem.groupBy({
        by: ["questionType"],
        where: { companyId, isActive: true },
        _count: { _all: true },
      }),
      prisma.questionBankItem.groupBy({
        by: ["category"],
        where: { companyId, isActive: true, category: { not: null } },
        _count: { _all: true },
      }),
      prisma.questionBankItem.count({ where: { companyId, isActive: false } }),
      prisma.templateQuestion.findMany({
        where: {
          bankItemId: { not: null },
          bankItem: { companyId, isActive: true },
          section: { version: { status: "ACTIVE" } },
        },
        select: {
          bankItemId: true,
          bankItem: { select: { questionType: true } },
        },
      }),
    ]);

    const usedByType = new Map<string, Set<string>>();
    for (const r of useRows) {
      const type = r.bankItem!.questionType;
      if (!usedByType.has(type)) usedByType.set(type, new Set());
      usedByType.get(type)!.add(r.bankItemId!);
    }

    const types = VALID_QUESTION_TYPES.map((type) => {
      const count =
        byType.find((b) => b.questionType === type)?._count._all ?? 0;
      return { type, count, used: usedByType.get(type)?.size ?? 0 };
    });
    const total = types.reduce((n, t) => n + t.count, 0);
    const used = types.reduce((n, t) => n + t.used, 0);

    const topCategories = byCategory
      .map((c) => ({ category: c.category as string, count: c._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return withCors(
      ApiResponse.success(
        { total, used, unused: total - used, archived, types, topCategories },
        "Question bank summary fetched successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
