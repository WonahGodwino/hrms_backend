//src/app/api/recruitment/applications/[applicationId]/cv/route.ts
// to download applicant CV for a particular job within a company
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { requireModuleAccess } from "@/app/lib/module-access";
import { ApiResponse, formatError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { resolveRecruitmentCompanyId } from "@/app/lib/recruitment/companyScope";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

function sanitizeFilename(name: string) {
  // keep it simple & safe
  return name.replace(/[^\w.\-() ]+/g, "_");
}

export async function GET(
  request: NextRequest,
  { params }: { params: { applicationId: string } }
) {
  const origin = request.headers.get("origin");

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return withCors(ApiResponse.error("Authorization header missing", 401), origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const user = await requireModuleAccess(token, 'RECRUITMENT', ["HR", "ADMIN", "SUPER_ADMIN"]);

    // Scope to the caller's active company (global switcher), role-enforced, so a
    // multi-company ADMIN can view CVs of the currently selected company.
    const scope = await resolveRecruitmentCompanyId(user, request.nextUrl.searchParams.get("companyId"));
    if (scope.error) {
      return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin);
    }
    const companyId = String(scope.companyId);
    const applicationId = params.applicationId;
    const dispositionParam = request.nextUrl.searchParams.get("disposition");
    const disposition = dispositionParam === "inline" ? "inline" : "attachment";

    // Find the CV file for this application within the same company
    // Priority: application.cvFileId if you use it
    const application = await prisma.jobApplication.findFirst({
      where: { id: applicationId, companyId },
      select: { id: true, cvFileId: true },
    });

    if (!application) {
      return withCors(ApiResponse.error("Application not found", 404), origin);
    }

    const file = await prisma.candidateFile.findFirst({
      where: {
        companyId,
        OR: [
          application.cvFileId ? { id: application.cvFileId } : undefined,
          { applicationId: applicationId, type: "CV" },
        ].filter(Boolean) as any,
      },
      select: {
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        data: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" }, // latest CV wins if multiple
    });

    if (!file) {
      return withCors(ApiResponse.error("CV file not found for this application", 404), origin);
    }

    const filename = sanitizeFilename(file.fileName || "cv");
    const mimeType = file.mimeType || "application/octet-stream";

    // Support either inline preview or forced download.
    const res = new NextResponse(file.data, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(file.sizeBytes ?? file.data.length),
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });

    return withCors(res, origin);
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}
