import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  CycleAction,
  TRANSITIONS,
  getCycleCapabilities,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import {
  CycleTransitionError,
  applyCycleTransition,
  getActivationBlockers,
  getTransitionImpact,
} from "@/app/lib/appraisal-cycles/cycle-transitions";
import { notifyCycleStarted } from "@/app/lib/appraisal-cycles/cycle-notifications";
import { kickAutomation } from "@/app/lib/automation-events";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const DONE: Record<CycleAction, string> = {
  activate: "activated",
  schedule: "scheduled",
  pause: "paused",
  resume: "resumed",
  complete: "completed",
  archive: "archived",
  restore: "restored",
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = request.headers.get("origin");
  const reject = (status: number, body: Record<string, unknown>) =>
    withCors(
      NextResponse.json({ success: false, ...body }, { status }),
      origin,
    );

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return reject(401, { message: "Authorization header missing" });
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);
    const { companyId, action, confirmImpact } = await request.json();

    if (!companyId || !action)
      return reject(400, {
        message: "Missing required fields: companyId, action",
      });
    if (!(action in TRANSITIONS)) {
      return reject(400, {
        message: `Invalid action. Must be one of: ${Object.keys(TRANSITIONS).join(", ")}`,
      });
    }
    const act = action as CycleAction;
    if (!(await verifyCompanyAccess(user, companyId))) {
      return reject(403, { message: "Forbidden: No access to this company" });
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      include: {
        phases: true,
        departmentScopes: { select: { departmentId: true } },
      },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    if (!TRANSITIONS[act].includes(cycle.status)) {
      return reject(409, {
        message: `Can't ${act} a cycle that is ${cycle.status.toLowerCase()}.`,
        allowedActions: getCycleCapabilities(cycle.status).allowedActions,
      });
    }

    if (act === "activate" || act === "schedule") {
      const blockers = await getActivationBlockers(prisma as any, cycle, act);
      if (blockers.length) {
        return reject(400, {
          message: `Can't ${act} yet: ${blockers[0]}${blockers.length > 1 ? ` (+${blockers.length - 1} more)` : ""}`,
          blockers,
        });
      }
    }

    if (act === "archive" || act === "complete") {
      const impact = await getTransitionImpact(prisma as any, cycle, act);
      if (impact.requiresConfirmation && !confirmImpact) {
        return reject(409, {
          message: impact.message,
          requiresConfirmation: true,
          impact,
        });
      }
    }

    if (act === "restore") {
      const clash = await prisma.appraisalCycle.findFirst({
        where: {
          companyId,
          id: { not: cycle.id },
          status: { not: "ARCHIVED" },
          name: { equals: cycle.name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (clash) {
        return reject(409, {
          message: `Another cycle is already named "${cycle.name}". Rename or archive that one first.`,
        });
      }
    }

    const result = await prisma.$transaction(
      (tx) =>
        applyCycleTransition(tx, { cycle, action: act, actorId: user.userId }),
      { timeout: 60000, maxWait: 10000 },
    );

    if (act === "activate") {
      await notifyCycleStarted(cycle.id).catch((e) =>
        console.error("Cycle start notifications failed:", e),
      );
      kickAutomation(cycle.companyId);
    }

    return withCors(
      ApiResponse.success(
        {
          ...result.updated,
          participantsEnrolled: result.enrolled,
          ...getCycleCapabilities(result.updated.status),
        },
        `Cycle ${DONE[act]} successfully`,
      ),
      origin,
    );
  } catch (error) {
    if (error instanceof CycleTransitionError) {
      return reject(error.status, { message: error.message, ...error.extra });
    }
    return withCors(handleApiError(error), origin);
  }
}
