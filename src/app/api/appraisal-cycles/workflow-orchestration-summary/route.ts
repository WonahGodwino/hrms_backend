import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  AUTOMATION_CAPABILITIES,
  getOrDefaultSettings,
} from "@/app/lib/appraisal-cycles/workflow-settings-utils";
import { prisma } from "@/app/lib/db";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/appraisal-cycles/workflow-orchestration-summary?companyId=...
// Backs WorkflowOrchestrationPanel. Reports what is CONFIGURED (the defaults new
// cycles start with) and which automations are actually switched on.
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

    const s = await getOrDefaultSettings(prisma as any, companyId);

    return withCors(
      ApiResponse.success(
        {
          capabilities: AUTOMATION_CAPABILITIES,
          approval: {
            routing: s.approvalRouting,
            requireHrSignoff: s.requireHrSignoff,
            autoAdvanceApprovals: s.autoAdvanceApprovals,
          },
          automation: {
            remindersEnabled: s.remindersEnabled,
            reminderLeadHours: s.reminderLeadHours,
            reminderRecipients: s.reminderRecipients,
            escalationEnabled: s.escalationEnabled,
            escalationThresholdHours: s.escalationThresholdHours,
          },
          peers: { peersPerEmployee: s.peersPerEmployee },
        },
        "Workflow orchestration summary retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
