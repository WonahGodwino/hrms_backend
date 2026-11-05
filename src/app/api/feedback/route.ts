import { NextRequest } from "next/server";
import { FeedbackCategory, FeedbackSentiment, Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  enumOf,
  feedbackSelect,
  parseFeedbackPayload,
  resolveSelf,
  serializeFeedback,
} from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const ROLES = ["STAFF", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];

// GET /api/feedback?companyId=...   (feedback received by the caller)
// Optional: category, sentiment, departmentId (sender's department), search (content,
//           sender name or exact #tag), sort (newest | liked), limit (max 50), offset
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
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

    const category = searchParams.get("category");
    const sentiment = searchParams.get("sentiment");
    if (category && !enumOf(Object.values(FeedbackCategory), category))
      return withCors(ApiResponse.error("Invalid category", 400), origin);
    if (sentiment && !enumOf(Object.values(FeedbackSentiment), sentiment))
      return withCors(ApiResponse.error("Invalid sentiment", 400), origin);
    const departmentId = searchParams.get("departmentId");
    const q = (searchParams.get("search") ?? "").trim().replace(/^#/, "");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      50,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    const where: Prisma.FeedbackWhereInput = {
      companyId,
      recipientId: self.id,
      ...(category ? { category: category as FeedbackCategory } : {}),
      ...(sentiment ? { sentiment: sentiment as FeedbackSentiment } : {}),
      ...(departmentId ? { author: { departmentId } } : {}),
      ...(q
        ? {
            OR: [
              { content: { contains: q, mode: "insensitive" } },
              { tags: { has: q.toLowerCase() } },
              { author: { firstName: { contains: q, mode: "insensitive" } } },
              { author: { lastName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        select: feedbackSelect(self.id),
        orderBy:
          searchParams.get("sort") === "liked"
            ? [{ likes: { _count: "desc" } }, { createdAt: "desc" }]
            : [{ createdAt: "desc" }],
        skip: offset,
        take: limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    return withCors(
      ApiResponse.success(
        { total, items: rows.map(serializeFeedback) },
        "Feedback retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/feedback
// body: { companyId, recipientId, category, sentiment, content, tags?, requestId? }
// With requestId: answers a PENDING request addressed to the caller (recipient must be the requester).
// Without it: only the recipient's manager, or HR / ADMIN / SUPER_ADMIN, may give feedback.
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const companyId = body?.companyId;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
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

    const parsed = parseFeedbackPayload(body);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);
    if (parsed.recipientId === self.id)
      return withCors(
        ApiResponse.error("You can't give feedback to yourself", 400),
        origin,
      );

    const recipient = await prisma.staffRecord.findFirst({
      where: { id: parsed.recipientId, companyId, isActive: true },
      select: { id: true, managerId: true },
    });
    if (!recipient)
      return withCors(ApiResponse.error("Colleague not found", 404), origin);

    let req: { id: string; requesterId: string } | null = null;
    if (parsed.requestId) {
      req = await prisma.feedbackRequest.findFirst({
        where: {
          id: parsed.requestId,
          companyId,
          reviewerId: self.id,
          status: "PENDING",
        },
        select: { id: true, requesterId: true },
      });
      if (!req)
        return withCors(
          ApiResponse.error(
            "No pending request from this person was found",
            409,
          ),
          origin,
        );
      if (req.requesterId !== recipient.id)
        return withCors(
          ApiResponse.error(
            "recipientId must be the person who requested feedback",
            400,
          ),
          origin,
        );
    } else if (!self.companyWide && recipient.managerId !== self.id) {
      return withCors(
        ApiResponse.error(
          "Feedback without a request can only be given by the person's manager or HR",
          403,
        ),
        origin,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.feedback.create({
        data: {
          companyId,
          authorId: self.id,
          recipientId: recipient.id,
          requestId: req?.id ?? null,
          category: parsed.category,
          sentiment: parsed.sentiment,
          content: parsed.content,
          tags: parsed.tags,
        },
      });
      await tx.feedbackHistory.create({
        data: {
          feedbackId: row.id,
          companyId,
          action: "FEEDBACK_CREATED",
          actorId: self.id,
          newData: {
            recipientId: recipient.id,
            category: parsed.category,
            sentiment: parsed.sentiment,
          },
        },
      });
      if (req) {
        await tx.feedbackRequest.update({
          where: { id: req.id },
          data: { status: "COMPLETED", respondedAt: new Date() },
        });
        await tx.feedbackHistory.create({
          data: {
            requestId: req.id,
            companyId,
            action: "REQUEST_COMPLETED",
            actorId: self.id,
            previousData: { status: "PENDING" },
            newData: { status: "COMPLETED", feedbackId: row.id },
          },
        });
      }
      return tx.feedback.findUniqueOrThrow({
        where: { id: row.id },
        select: feedbackSelect(self.id),
      });
    });

    return withCors(
      ApiResponse.success(
        serializeFeedback(created),
        "Feedback sent successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
