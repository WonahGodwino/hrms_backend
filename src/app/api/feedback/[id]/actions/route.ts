import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { MAX_LONG_TEXT, RouteContext } from "@/app/lib/self-appraisal";
import { REPLY_EMOJIS, enumOf, resolveSelf } from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/feedback/:id/actions
// body: { companyId, action: "ACKNOWLEDGE" | "COMMENT" | "REPORT", message?, emoji?, reason? }
// ACKNOWLEDGE and REPORT: recipient only. COMMENT: recipient or author; needs a message or an emoji.
export async function POST(
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
    const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { id } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    const action = body?.action;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    if (!["ACKNOWLEDGE", "COMMENT", "REPORT"].includes(action))
      return withCors(
        ApiResponse.error("action must be ACKNOWLEDGE, COMMENT or REPORT", 400),
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
      select: { authorId: true, recipientId: true, acknowledgedAt: true },
    });
    const isRecipient = !!f && f.recipientId === self.id;
    const isAuthor = !!f && f.authorId === self.id;
    if (!f || (!isRecipient && !isAuthor))
      return withCors(ApiResponse.error("Feedback not found", 404), origin);

    if (action === "ACKNOWLEDGE") {
      if (!isRecipient)
        return withCors(
          ApiResponse.error("Only the recipient can acknowledge feedback", 403),
          origin,
        );
      if (!f.acknowledgedAt) {
        await prisma.$transaction(async (tx) => {
          await tx.feedback.update({
            where: { id },
            data: { acknowledgedAt: new Date() },
          });
          await tx.feedbackHistory.create({
            data: {
              feedbackId: id,
              companyId,
              action: "ACKNOWLEDGED",
              actorId: self.id,
            },
          });
        });
      }
      return withCors(
        ApiResponse.success({ acknowledged: true }, "Feedback acknowledged"),
        origin,
      );
    }

    if (action === "REPORT") {
      if (!isRecipient)
        return withCors(
          ApiResponse.error("Only the recipient can report feedback", 403),
          origin,
        );
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      if (reason.length > 1000)
        return withCors(
          ApiResponse.error("reason must be at most 1000 characters", 400),
          origin,
        );
      const existing = await prisma.feedbackReport.findUnique({
        where: {
          feedbackId_reporterId: { feedbackId: id, reporterId: self.id },
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.$transaction(async (tx) => {
          await tx.feedbackReport.create({
            data: {
              feedbackId: id,
              reporterId: self.id,
              reason: reason || null,
            },
          });
          await tx.feedbackHistory.create({
            data: {
              feedbackId: id,
              companyId,
              action: "REPORTED",
              actorId: self.id,
            },
          });
        });
      }
      return withCors(
        ApiResponse.success({ reported: true }, "Feedback reported to HR"),
        origin,
      );
    }

    // COMMENT
    const message =
      typeof body?.message === "string" ? body.message.trim() : "";
    const emoji = body?.emoji ?? null;
    if (emoji !== null && !enumOf(REPLY_EMOJIS, emoji))
      return withCors(
        ApiResponse.error(
          `emoji must be one of: ${REPLY_EMOJIS.join(" ")}`,
          400,
        ),
        origin,
      );
    if (!message && !emoji)
      return withCors(
        ApiResponse.error("A message or an emoji is required", 400),
        origin,
      );
    if (message.length > MAX_LONG_TEXT)
      return withCors(
        ApiResponse.error(
          `message must be at most ${MAX_LONG_TEXT} characters`,
          400,
        ),
        origin,
      );

    const comment = await prisma.$transaction(async (tx) => {
      const row = await tx.feedbackComment.create({
        data: {
          feedbackId: id,
          authorId: self.id,
          message: message || null,
          emoji,
        },
        select: { id: true, message: true, emoji: true, createdAt: true },
      });
      await tx.feedbackHistory.create({
        data: {
          feedbackId: id,
          companyId,
          action: "COMMENTED",
          actorId: self.id,
        },
      });
      return row;
    });
    return withCors(
      ApiResponse.success(comment, "Response sent successfully", 201),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
