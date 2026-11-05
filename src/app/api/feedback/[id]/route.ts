import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  PERSON_SELECT,
  canViewFeedback,
  feedbackSelect,
  resolveSelf,
  serializeFeedback,
  toPerson,
} from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const ROLES = ["STAFF", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];

// GET /api/feedback/:id?companyId=...   (the item plus its reply thread)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(
      authHeader.replace("Bearer ", ""),
      ROLES,
    );

    const { id } = await context.params;
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const f = await prisma.feedback.findFirst({
      where: { id, companyId },
      select: {
        ...feedbackSelect(self.id),
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            message: true,
            emoji: true,
            createdAt: true,
            author: { select: PERSON_SELECT },
          },
        },
      },
    });
    if (!f || !canViewFeedback(self, f))
      return withCors(ApiResponse.error("Feedback not found", 404), origin);

    return withCors(
      ApiResponse.success(
        {
          ...serializeFeedback(f),
          thread: f.comments.map((c) => ({
            id: c.id,
            author: toPerson(c.author),
            message: c.message,
            emoji: c.emoji,
            createdAt: c.createdAt,
          })),
        },
        "Feedback retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PUT /api/feedback/:id   body: { companyId, liked?: boolean, bookmarked?: boolean }
// Sets the caller's own like / bookmark (idempotent, not a toggle).
export async function PUT(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(
      authHeader.replace("Bearer ", ""),
      ROLES,
    );

    const { id } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    const { liked, bookmarked } = body;
    if (
      (liked !== undefined && typeof liked !== "boolean") ||
      (bookmarked !== undefined && typeof bookmarked !== "boolean") ||
      (liked === undefined && bookmarked === undefined)
    )
      return withCors(
        ApiResponse.error("Send liked and/or bookmarked as booleans", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const f = await prisma.feedback.findFirst({
      where: { id, companyId },
      select: { authorId: true, recipientId: true },
    });
    if (!f || !canViewFeedback(self, f))
      return withCors(ApiResponse.error("Feedback not found", 404), origin);

    const key = {
      feedbackId_staffRecordId: { feedbackId: id, staffRecordId: self.id },
    };
    const row = { feedbackId: id, staffRecordId: self.id };
    await prisma.$transaction(async (tx) => {
      if (liked === true)
        await tx.feedbackLike.upsert({ where: key, create: row, update: {} });
      if (liked === false) await tx.feedbackLike.deleteMany({ where: row });
      if (bookmarked === true)
        await tx.feedbackBookmark.upsert({
          where: key,
          create: row,
          update: {},
        });
      if (bookmarked === false)
        await tx.feedbackBookmark.deleteMany({ where: row });
    });

    const state = await prisma.feedback.findUniqueOrThrow({
      where: { id },
      select: {
        _count: { select: { likes: true } },
        likes: { where: { staffRecordId: self.id }, select: { id: true } },
        bookmarks: { where: { staffRecordId: self.id }, select: { id: true } },
      },
    });
    return withCors(
      ApiResponse.success(
        {
          liked: state.likes.length > 0,
          bookmarked: state.bookmarks.length > 0,
          likes: state._count.likes,
        },
        "Updated successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
