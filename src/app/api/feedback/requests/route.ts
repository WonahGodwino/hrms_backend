import { NextRequest } from "next/server";
import { FeedbackRequestStatus, Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  PERSON_SELECT,
  enumOf,
  parseRequestPayload,
  resolveSelf,
  toPerson,
} from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const ROLES = ["STAFF", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];
const REQUEST_SELECT = {
  id: true,
  message: true,
  focusAreas: true,
  status: true,
  createdAt: true,
  respondedAt: true,
  requester: { select: PERSON_SELECT },
  reviewer: { select: PERSON_SELECT },
} satisfies Prisma.FeedbackRequestSelect;
type RequestRow = Prisma.FeedbackRequestGetPayload<{
  select: typeof REQUEST_SELECT;
}>;
const serialize = (r: RequestRow) => ({
  id: r.id,
  requester: toPerson(r.requester),
  reviewer: toPerson(r.reviewer),
  message: r.message ?? "",
  focusAreas: r.focusAreas,
  status: r.status,
  createdAt: r.createdAt,
  respondedAt: r.respondedAt,
});

// GET /api/feedback/requests?companyId=...
// Optional: direction (incoming = asked of me, default | outgoing = asked by me),
//           status (PENDING|COMPLETED|DECLINED), limit (max 50), offset
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

    const status = searchParams.get("status");
    if (status && !enumOf(Object.values(FeedbackRequestStatus), status))
      return withCors(ApiResponse.error("Invalid status", 400), origin);
    const outgoing = searchParams.get("direction") === "outgoing";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      50,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    const where: Prisma.FeedbackRequestWhereInput = {
      companyId,
      ...(outgoing ? { requesterId: self.id } : { reviewerId: self.id }),
      ...(status ? { status: status as FeedbackRequestStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.feedbackRequest.findMany({
        where,
        select: REQUEST_SELECT,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.feedbackRequest.count({ where }),
    ]);
    return withCors(
      ApiResponse.success(
        { total, items: rows.map(serialize) },
        "Requests retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/feedback/requests
// body: { companyId, reviewerIds: string[] (1-10), focusAreas?: string[], message? }
// One request row is created per reviewer.
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

    const parsed = parseRequestPayload(body);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);
    if (parsed.reviewerIds.includes(self.id))
      return withCors(
        ApiResponse.error("You can't request feedback from yourself", 400),
        origin,
      );

    const reviewers = await prisma.staffRecord.findMany({
      where: { id: { in: parsed.reviewerIds }, companyId, isActive: true },
      select: { id: true },
    });
    if (reviewers.length !== parsed.reviewerIds.length)
      return withCors(
        ApiResponse.error("One or more colleagues were not found", 404),
        origin,
      );

    const pending = await prisma.feedbackRequest.count({
      where: {
        companyId,
        requesterId: self.id,
        reviewerId: { in: parsed.reviewerIds },
        status: "PENDING",
      },
    });
    if (pending > 0)
      return withCors(
        ApiResponse.error(
          "You already have a pending request to one or more of these people",
          409,
        ),
        origin,
      );

    const created = await prisma.$transaction(async (tx) => {
      const rows: RequestRow[] = [];
      for (const reviewerId of parsed.reviewerIds) {
        const row = await tx.feedbackRequest.create({
          data: {
            companyId,
            requesterId: self.id,
            reviewerId,
            message: parsed.message,
            focusAreas: parsed.focusAreas,
          },
          select: REQUEST_SELECT,
        });
        await tx.feedbackHistory.create({
          data: {
            requestId: row.id,
            companyId,
            action: "REQUEST_CREATED",
            actorId: self.id,
            newData: { reviewerId, focusAreas: parsed.focusAreas },
          },
        });
        rows.push(row);
      }
      return rows;
    });

    return withCors(
      ApiResponse.success(
        created.map(serialize),
        "Feedback request sent successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
