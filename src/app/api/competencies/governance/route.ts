import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { getGovernanceReport } from "@/app/lib/competencies/competency-governance";
import { getDuplicateSummary } from "@/app/lib/competencies/competency-similarity";
import { getReviewCounts } from "@/app/lib/competencies/competency-reviews";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/competencies/governance?companyId=xxx&view=summary|compliance
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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const view = searchParams.get("view") ?? "summary";

    if (!companyId) {
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    }
    if (view !== "summary" && view !== "compliance") {
      return withCors(
        ApiResponse.error('view must be "summary" or "compliance"', 400),
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

    const report = await getGovernanceReport(companyId);
    const { compliance } = report;

    if (view === "compliance") {
      return withCors(
        ApiResponse.success(
          {
            generatedAt: report.generatedAt,
            complianceCompetencies: compliance.competencies,
            bySeverity: compliance.bySeverity,
            issues: compliance.issues,
          },
          "Compliance report fetched successfully",
        ),
        origin,
      );
    }

    const status =
      compliance.issues.length > 0
        ? "issues"
        : compliance.competencies > 0
          ? "ok"
          : "none";

    const duplicates = await getDuplicateSummary(companyId);
    const reviews = await getReviewCounts(companyId);

    return withCors(
      ApiResponse.success(
        {
          generatedAt: report.generatedAt,
          totalActive: report.totalActive,
          consistency: report.consistency,
          outdated: {
            thresholdMonths: report.outdated.thresholdMonths,
            count: report.outdated.items.length,
            items: report.outdated.items.slice(0, 5),
          },
          compliance: {
            status, // "ok" | "issues" | "none" (no compliance competencies defined yet)
            competencies: compliance.competencies,
            issueCount: compliance.issues.length,
            bySeverity: compliance.bySeverity,
            topIssues: compliance.issues.slice(0, 3),
          },
          duplicates,
          reviews
        },
        "Governance summary fetched successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
