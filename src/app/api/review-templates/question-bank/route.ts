import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { QuestionType } from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { VALID_QUESTION_TYPES } from "@/app/lib/review-templates/question-bank-utils";
import {
  normalizeQuestion,
  resolveQuestionLinks,
} from "@/app/lib/review-templates/question-rules";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/question-bank?companyId=&search=&questionType=&category=&page=&limit=
// Powers FormBuilderModal's "insert from bank" flow.
// ---------------------------------------------------------------------------
const ACTIVE_USE = { section: { version: { status: "ACTIVE" as const } } };

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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const search = searchParams.get("search")?.trim();
    const questionType = searchParams.get("questionType");
    const category = searchParams.get("category");
    const competencyId = searchParams.get("competencyId");
    const status = (searchParams.get("status") ?? "active").toLowerCase(); // active | archived | all
    const used = searchParams.get("used"); // "true" | "false" | null
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
    );

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

    let normalizedType: QuestionType | undefined;
    if (questionType) {
      normalizedType = questionType.toUpperCase() as QuestionType;
      if (!VALID_QUESTION_TYPES.includes(normalizedType)) {
        return withCors(
          ApiResponse.error(
            `Invalid questionType. Must be one of: ${VALID_QUESTION_TYPES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
    }

    const where: any = {
      companyId,
      ...(status === "archived"
        ? { isActive: false }
        : status === "all"
          ? {}
          : { isActive: true }),
      ...(normalizedType ? { questionType: normalizedType } : {}),
      ...(category
        ? { category: { equals: category, mode: "insensitive" } }
        : {}),
      ...(competencyId ? { competencyId } : {}),
      ...(search ? { prompt: { contains: search, mode: "insensitive" } } : {}),
      ...(used === "true"
        ? { templateQuestions: { some: ACTIVE_USE } }
        : used === "false"
          ? { templateQuestions: { none: ACTIVE_USE } }
          : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.questionBankItem.findMany({
        where,
        include: {
          options: { orderBy: { displayOrder: "asc" } },
          competency: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.questionBankItem.count({ where }),
    ]);

    // Live usage: distinct templates whose published version contains the question
    const ids = items.map((i) => i.id);
    const useRows = ids.length
      ? await prisma.templateQuestion.findMany({
          where: { bankItemId: { in: ids }, ...ACTIVE_USE },
          select: {
            bankItemId: true,
            section: { select: { version: { select: { templateId: true } } } },
          },
        })
      : [];
    const usedBy = new Map<string, Set<string>>();
    for (const r of useRows) {
      if (!r.bankItemId) continue;
      if (!usedBy.has(r.bankItemId)) usedBy.set(r.bankItemId, new Set());
      usedBy.get(r.bankItemId)!.add(r.section.version.templateId);
    }

    return withCors(
      ApiResponse.success(
        {
          items: items.map((i) => ({
            ...i,
            usage: usedBy.get(i.id)?.size ?? 0,
          })),
          pagination: { page, limit, total },
        },
        "Question bank retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/question-bank
// body: { companyId, prompt, questionType, category?, competencyId?, proficiencyScaleId?, options? }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
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
    const body = await request.json();

    const { companyId, category } = body;
    if (!companyId) {
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
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

    const { value, error } = normalizeQuestion(body);
    if (!value) return withCors(ApiResponse.error(error!, 400), origin);

    const links = await resolveQuestionLinks(companyId, value);
    if ("error" in links)
      return withCors(ApiResponse.error(links.error, 400), origin);

    const created = await prisma.questionBankItem.create({
      data: {
        companyId,
        prompt: value.prompt,
        helpText: value.helpText,
        questionType: value.questionType,
        category: category || null,
        competencyId: value.competencyId,
        proficiencyScaleId: links.proficiencyScaleId,
        config: value.config ?? undefined,
        createdBy: user.userId,
        options: value.options.length
          ? {
              create: value.options.map((o, i) => ({
                label: o.label,
                value: o.value,
                displayOrder: i,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });

    return withCors(
      ApiResponse.success(
        created,
        "Question bank item created successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
