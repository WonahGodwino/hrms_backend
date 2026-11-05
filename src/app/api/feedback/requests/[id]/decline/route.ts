import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { resolveSelf } from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/feedback/requests/:id/decline   body: { companyId }
// The reviewer declines a PENDING request. Answering one is POST /api/feedback with requestId.
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

    const req = await prisma.feedbackRequest.findFirst({
      where: { id, companyId, reviewerId: self.id },
      select: { status: true },
    });
    if (!req)
      return withCors(ApiResponse.error("Request not found", 404), origin);
    if (req.status !== "PENDING")
      return withCors(
        ApiResponse.error(`This request is already ${req.status}`, 409),
        origin,
      );

    await prisma.$transaction(async (tx) => {
      await tx.feedbackRequest.update({
        where: { id },
        data: { status: "DECLINED", respondedAt: new Date() },
      });
      await tx.feedbackHistory.create({
        data: {
          requestId: id,
          companyId,
          action: "REQUEST_DECLINED",
          actorId: self.id,
          previousData: { status: "PENDING" },
          newData: { status: "DECLINED" },
        },
      });
    });
    return withCors(
      ApiResponse.success({ id, status: "DECLINED" }, "Request declined"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
