import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import {
  AppraisalReminderRecipient,
  ApprovalRoutingType,
} from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  AUTOMATION_CAPABILITIES,
  getOrDefaultSettings,
  logSettingsAction,
  VALID_REMINDER_RECIPIENTS,
  VALID_ROUTING_TYPES,
} from "@/app/lib/appraisal-cycles/workflow-settings-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/appraisal-cycles/workflow-settings?companyId=...
// Backs all three modals' initial hydration. `capabilities` says which automations
// are actually switched on, so the UI only describes behavior that happens.
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
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

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

    const settings = await getOrDefaultSettings(prisma as any, companyId);
    return withCors(
      ApiResponse.success(
        { ...settings, capabilities: AUTOMATION_CAPABILITIES },
        "Settings retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/appraisal-cycles/workflow-settings
// body: { companyId, approvalRouting?, requireHrSignoff?, autoAdvanceApprovals?,
//         remindersEnabled?, reminderLeadHours?, escalationEnabled?,
//         escalationThresholdHours?, reminderRecipients?, peersPerEmployee? }
// Upserts (lazy creation) — this route is what first creates the settings row.
// Only affects future cycles; running cycles keep their own snapshot values,
// per the "changes apply to cycles created after saving" decision.
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
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
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);
    const body = await request.json();

    const {
      companyId,
      approvalRouting,
      requireHrSignoff,
      autoAdvanceApprovals,
      remindersEnabled,
      reminderLeadHours,
      escalationEnabled,
      escalationThresholdHours,
      reminderRecipients,
      peersPerEmployee,
    } = body;

    if (!companyId)
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

    const bad = (message: string) =>
      withCors(ApiResponse.error(message, 400), origin);

    for (const [name, value] of Object.entries({
      requireHrSignoff,
      autoAdvanceApprovals,
      remindersEnabled,
      escalationEnabled,
    })) {
      if (value !== undefined && typeof value !== "boolean") {
        return bad(`${name} must be true or false`);
      }
    }
    const intRules: [string, unknown, number, number][] = [
      ["reminderLeadHours", reminderLeadHours, 1, 720],
      ["escalationThresholdHours", escalationThresholdHours, 1, 720],
      ["peersPerEmployee", peersPerEmployee, 1, 5],
    ];
    for (const [name, value, min, max] of intRules) {
      if (
        value !== undefined &&
        (!Number.isInteger(value) ||
          (value as number) < min ||
          (value as number) > max)
      ) {
        return bad(`${name} must be a whole number from ${min} to ${max}`);
      }
    }

    let normalizedRouting: ApprovalRoutingType | undefined;
    if (approvalRouting) {
      normalizedRouting = String(
        approvalRouting,
      ).toUpperCase() as ApprovalRoutingType;
      if (!VALID_ROUTING_TYPES.includes(normalizedRouting)) {
        return bad(
          `Invalid approvalRouting. Must be one of: ${VALID_ROUTING_TYPES.join(", ")}`,
        );
      }
    }

    let normalizedRecipients: AppraisalReminderRecipient[] | undefined;
    if (reminderRecipients !== undefined) {
      if (!Array.isArray(reminderRecipients)) {
        return bad("reminderRecipients must be a list");
      }
      normalizedRecipients = [
        ...new Set(
          reminderRecipients.map((r: string) => String(r).toUpperCase()),
        ),
      ] as AppraisalReminderRecipient[];
      const invalid = normalizedRecipients.find(
        (r) => !VALID_REMINDER_RECIPIENTS.includes(r),
      );
      if (invalid) return bad(`Invalid reminderRecipient: ${invalid}`);
    }

    // Reminders need someone to remind.
    if (remindersEnabled !== undefined || normalizedRecipients !== undefined) {
      const current = await getOrDefaultSettings(prisma as any, companyId);
      const enabled = remindersEnabled ?? current.remindersEnabled;
      const recipients = normalizedRecipients ?? current.reminderRecipients;
      if (enabled && recipients.length === 0) {
        return bad(
          "Choose at least one reminder recipient, or turn reminders off.",
        );
      }
    }

    const fields = {
      ...(normalizedRouting ? { approvalRouting: normalizedRouting } : {}),
      ...(requireHrSignoff !== undefined ? { requireHrSignoff } : {}),
      ...(autoAdvanceApprovals !== undefined ? { autoAdvanceApprovals } : {}),
      ...(remindersEnabled !== undefined ? { remindersEnabled } : {}),
      ...(reminderLeadHours !== undefined ? { reminderLeadHours } : {}),
      ...(escalationEnabled !== undefined ? { escalationEnabled } : {}),
      ...(escalationThresholdHours !== undefined
        ? { escalationThresholdHours }
        : {}),
      ...(normalizedRecipients
        ? { reminderRecipients: normalizedRecipients }
        : {}),
      ...(peersPerEmployee !== undefined ? { peersPerEmployee } : {}),
      updatedBy: user.userId,
    };

    const result = await prisma.$transaction(async (tx) => {
      const previous = await getOrDefaultSettings(tx, companyId);

      const updated = await tx.appraisalWorkflowSettings.upsert({
        where: { companyId },
        create: { companyId, ...fields },
        update: fields,
      });

      await logSettingsAction(tx, {
        companyId,
        action: "SETTINGS_UPDATED",
        actorId: user.userId,
        previousData: previous,
        newData: updated,
      });

      return updated;
    });

    return withCors(
      ApiResponse.success(
        { ...result, capabilities: AUTOMATION_CAPABILITIES },
        "Settings updated successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
