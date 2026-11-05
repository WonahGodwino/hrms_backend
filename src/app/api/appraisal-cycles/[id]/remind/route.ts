import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { logCycleAction } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";
import { sendManualReminders } from "@/app/lib/appraisal-cycles/cycle-notifications";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/appraisal-cycles/:id/remind   body: { companyId }
// Notifies everyone who still owes a self-appraisal or manager review in a running cycle.
// Returns { remindersSent, recipients }. Limited to once an hour per cycle.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = request.headers.get("origin");
  const reject = (status: number, message: string) =>
    withCors(
      NextResponse.json({ success: false, message }, { status }),
      origin,
    );

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return reject(401, "Authorization header missing");
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);
    const { companyId } = await request.json();

    if (!companyId) return reject(400, "Missing required field: companyId");
    if (!(await verifyCompanyAccess(user, companyId)))
      return reject(403, "Forbidden: No access to this company");

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, status: true },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );
    if (!["ACTIVE", "ESCALATED"].includes(cycle.status)) {
      return reject(
        400,
        "Reminders can only be sent for Active or Escalated cycles",
      );
    }

    const result = await sendManualReminders(cycle.id);
    if (result.throttled) {
      return reject(
        429,
        "Reminders for this cycle were already sent in the last hour. Try again later.",
      );
    }

    if (result.remindersSent > 0) {
      await logCycleAction(prisma as any, {
        cycleId: cycle.id,
        companyId,
        action: "REMINDER_SENT",
        actorId: user.userId,
        newData: {
          remindersSent: result.remindersSent,
          recipients: result.recipients,
        },
      });
    }

    return withCors(
      ApiResponse.success(
        { remindersSent: result.remindersSent, recipients: result.recipients },
        result.remindersSent > 0
          ? "Reminders sent"
          : "Nobody has pending work right now",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
