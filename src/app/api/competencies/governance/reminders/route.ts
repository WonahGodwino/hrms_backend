import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { runReviewReminders } from "@/app/lib/competencies/competency-review-notifications";

// Called by a scheduler (not by users). Requires: Authorization: Bearer <CRON_SECRET>
async function handle(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (
      !secret ||
      request.headers.get("authorization") !== `Bearer ${secret}`
    ) {
      return ApiResponse.error("Unauthorized", 401);
    }
    const result = await runReviewReminders();
    return ApiResponse.success(result, "Review reminders processed");
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = handle;
export const POST = handle;
