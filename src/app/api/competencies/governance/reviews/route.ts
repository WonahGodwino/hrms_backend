import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  getReviewBoard,
  applyReviewAction,
  ReviewError,
} from "@/app/lib/competencies/competency-reviews";
import { runReviewReminders } from "@/app/lib/competencies/competency-review-notifications";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/competencies/governance/reviews?companyId=xxx
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
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);

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

    // Lazy reminder run: keeps reminders flowing even without a scheduler.
    // A failure here must never block the board.
    try {
      await runReviewReminders({ companyId });
    } catch (err) {
      console.error("Review reminder run failed:", err);
    }

    const board = await getReviewBoard(companyId);
    return withCors(
      ApiResponse.success(board, "Review schedule fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/competencies/governance/reviews
// Body: { companyId, action: "schedule" | "reschedule" | "cancel" | "complete", ... }
//  schedule:   competencyIds[], scheduledFor (YYYY-MM-DD), assigneeId
//  reschedule: reviewId, scheduledFor?, assigneeId?
//  cancel:     reviewId
//  complete:   reviewId, outcome (CONFIRMED | UPDATED | RETIRED), notes?
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
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);
    const body = await request.json();

    if (!body?.companyId) {
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    }
    const hasAccess = await verifyCompanyAccess(user, body.companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const staff = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    });
    const actor = {
      userId: user.userId,
      name: staff ? `${staff.firstName} ${staff.lastName}` : "A colleague",
    };

    const result = await applyReviewAction(body.companyId, actor, body);
    return withCors(
      ApiResponse.success(result, "Review updated successfully"),
      origin,
    );
  } catch (error) {
    if (error instanceof ReviewError) {
      if (error.details) {
        return withCors(
          NextResponse.json(
            { success: false, message: error.message, data: error.details },
            { status: error.status },
          ),
          origin,
        );
      }
      return withCors(ApiResponse.error(error.message, error.status), origin);
    }
    return withCors(handleApiError(error), origin);
  }
}
