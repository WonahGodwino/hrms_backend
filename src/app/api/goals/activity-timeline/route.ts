import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  getStaffRecordIdFromEmail,
} from "@/app/lib/access-control";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/goals/activity-timeline?companyId=&staffRecordId=&limit=&upcomingDays=
// Backs TimelineSection. Merges four source tables into one feed:
//   - GoalMilestone (status=COMPLETED, recently)        -> type "completed"
//   - GoalEvidence (recent uploads)                      -> type "upload"
//   - GoalComment (type=MANAGER_ACKNOWLEDGEMENT)          -> type "manager"
//   - GoalMilestone (dueDate passed, not COMPLETED)       -> type "overdue"
//   - GoalMilestone (dueDate within upcomingDays, not COMPLETED) -> type "upcoming"
// Historical events (completed/upload/manager) are sorted newest-first.
// Overdue/upcoming are appended after, each sub-sorted by dueDate (most
// overdue first; soonest-upcoming first) since those aren't "past" events
// with a natural recency order — this mirrors the mock's ordering, where
// overdue/upcoming trail the historical entries.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    let staffRecordId = searchParams.get("staffRecordId");
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
    );
    const upcomingDays = Math.min(
      60,
      Math.max(1, parseInt(searchParams.get("upcomingDays") ?? "14", 10)),
    );

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

    if (["STAFF", "MANAGER"].includes(user.role)) {
      const ownId = await getStaffRecordIdFromEmail(user.email);
      if (!ownId)
        return withCors(
          ApiResponse.error("No staff record found for this user", 403),
          origin,
        );
      staffRecordId = ownId;
    }
    if (!staffRecordId)
      return withCors(
        ApiResponse.error("Missing required param: staffRecordId", 400),
        origin,
      );

    const now = new Date();
    const upcomingHorizon = new Date(now.getTime() + upcomingDays * 86_400_000);
    const goalWhere = { companyId, staffRecordId };

    const [
      completedMilestones,
      uploads,
      managerComments,
      overdueMilestones,
      upcomingMilestones,
    ] = await Promise.all([
      prisma.goalMilestone.findMany({
        where: { status: "COMPLETED", goal: goalWhere },
        orderBy: { completedAt: "desc" },
        take: limit,
        include: { goal: { select: { id: true, title: true } } },
      }),
      prisma.goalEvidence.findMany({
        where: { goal: goalWhere },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          uploader: { select: { firstName: true, lastName: true } },
          goal: { select: { id: true, title: true } },
        },
      }),
      prisma.goalComment.findMany({
        where: { type: "MANAGER_ACKNOWLEDGEMENT", goal: goalWhere },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          author: { select: { firstName: true, lastName: true } },
          goal: { select: { id: true, title: true } },
        },
      }),
      prisma.goalMilestone.findMany({
        where: {
          status: { not: "COMPLETED" },
          dueDate: { lt: now },
          goal: goalWhere,
        },
        orderBy: { dueDate: "asc" },
        take: limit,
        include: { goal: { select: { id: true, title: true } } },
      }),
      prisma.goalMilestone.findMany({
        where: {
          status: { not: "COMPLETED" },
          dueDate: { gte: now, lte: upcomingHorizon },
          goal: goalWhere,
        },
        orderBy: { dueDate: "asc" },
        take: limit,
        include: { goal: { select: { id: true, title: true } } },
      }),
    ]);

    const historical = [
      ...completedMilestones.map((m) => ({
        type: "completed" as const,
        title: `Milestone Completed: ${m.title}`,
        timestamp: m.completedAt,
        contributor: null, // milestone completion has no distinct actor captured yet (see note below)
        goalId: m.goal.id,
        goalTitle: m.goal.title,
      })),
      ...uploads.map((e) => ({
        type: "upload" as const,
        title: `Evidence Uploaded: ${e.fileName}`,
        timestamp: e.createdAt,
        contributor: `${e.uploader.firstName} ${e.uploader.lastName}`,
        goalId: e.goal.id,
        goalTitle: e.goal.title,
      })),
      ...managerComments.map((c) => ({
        type: "manager" as const,
        title: `Manager Acknowledgement: ${c.message}`,
        timestamp: c.createdAt,
        contributor: `${c.author.firstName} ${c.author.lastName}`,
        goalId: c.goal.id,
        goalTitle: c.goal.title,
      })),
    ]
      .sort(
        (a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0),
      )
      .slice(0, limit);

    const overdue = overdueMilestones.map((m) => ({
      type: "overdue" as const,
      title: `Milestone Overdue: ${m.title}`,
      timestamp: m.dueDate,
      contributor: "System",
      goalId: m.goal.id,
      goalTitle: m.goal.title,
    }));

    const upcoming = upcomingMilestones.map((m) => ({
      type: "upcoming" as const,
      title: `Upcoming Checkpoint: ${m.title}`,
      timestamp: m.dueDate,
      contributor: "System",
      goalId: m.goal.id,
      goalTitle: m.goal.title,
    }));

    const result = [...historical, ...overdue, ...upcoming].slice(0, limit);

    return withCors(
      ApiResponse.success(
        { entries: result },
        "Activity timeline retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
