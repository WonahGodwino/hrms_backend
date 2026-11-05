import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  getCompetencyMatrix,
  applyMatrixChanges,
  MatrixError,
} from "@/app/lib/competencies/competency-matrix";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/competencies/matrix?companyId=xxx&includeDrafts=true&departmentId=yyy
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

    const data = await getCompetencyMatrix(companyId, {
      includeDrafts: searchParams.get("includeDrafts") === "true",
      departmentId: searchParams.get("departmentId") || undefined,
    });

    return withCors(
      ApiResponse.success(data, "Competency matrix fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/competencies/matrix
// Body: { companyId, changes: [{ competencyId, designationId | departmentId,
//         action: "set" | "clear", requiredLevel?: number | null,
//         before?: null | { requiredLevel: number | null } }] }
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
    const { companyId, changes } = body;

    if (!companyId) {
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
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

    const result = await applyMatrixChanges({
      companyId,
      actorId: user.userId,
      changes,
    });

    return withCors(
      ApiResponse.success(result, "Matrix changes saved successfully"),
      origin,
    );
  } catch (error) {
    if (error instanceof MatrixError) {
      // Conflicts carry data (the conflicting cells), so build the response directly
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
