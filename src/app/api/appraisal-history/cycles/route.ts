import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  authorizeSelf,
  loadHistory,
  serializeRow,
} from "@/app/lib/appraisal-history";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const STATUSES = ["APPROVED", "ARCHIVED", "PENDING"];

// GET /api/appraisal-history/cycles?companyId=...
// Optional: search (cycle, manager, status, strengths, growth areas),
//           status (comma-separated APPROVED,ARCHIVED,PENDING), limit (default 10, max 50), offset
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const auth = await authorizeSelf(request, origin);
    if ("response" in auth) return auth.response;
    const { companyId, self, searchParams } = auth;

    const statuses = (searchParams.get("status") ?? "")
      .split(",")
      .filter(Boolean);
    if (statuses.some((s) => !STATUSES.includes(s)))
      return withCors(
        ApiResponse.error(
          `status must be a comma-separated list of: ${STATUSES.join(", ")}`,
          400,
        ),
        origin,
      );
    const q = (searchParams.get("search") ?? "").trim().toLowerCase();
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 1),
      50,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    const all = await loadHistory(companyId, self.id);
    const rows = all.filter((r) => {
      if (statuses.length && !statuses.includes(r.statusCode)) return false;
      if (!q) return true;
      return [r.period, r.manager ?? "", r.status, ...r.strengths, ...r.areas]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return withCors(
      ApiResponse.success(
        {
          totalCount: all.length,
          count: rows.length,
          items: rows.slice(offset, offset + limit).map(serializeRow),
        },
        "Appraisal cycles retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
