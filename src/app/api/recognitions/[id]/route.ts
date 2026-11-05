import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  recognitionSelect,
  recognitionVisibleWhere,
  resolveSelf,
  serializeRecognition,
} from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const ROLES = ["STAFF", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];

// GET /api/recognitions/:id?companyId=...
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(
      authHeader.replace("Bearer ", ""),
      ROLES,
    );

    const { id } = await context.params;
    const companyId = new URL(request.url).searchParams.get("companyId");
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
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const rec = await prisma.recognition.findFirst({
      where: { id, companyId, ...recognitionVisibleWhere(self) },
      select: recognitionSelect,
    });
    if (!rec)
      return withCors(ApiResponse.error("Recognition not found", 404), origin);
    return withCors(
      ApiResponse.success(
        serializeRecognition(rec, self.id),
        "Recognition retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PUT /api/recognitions/:id   body: { companyId, liked?: boolean, celebrated?: boolean }
// Sets the caller's own reactions (idempotent). Visibility rules apply.
export async function PUT(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(
      authHeader.replace("Bearer ", ""),
      ROLES,
    );

    const { id } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    const { liked, celebrated } = body;
    if (
      (liked !== undefined && typeof liked !== "boolean") ||
      (celebrated !== undefined && typeof celebrated !== "boolean") ||
      (liked === undefined && celebrated === undefined)
    )
      return withCors(
        ApiResponse.error("Send liked and/or celebrated as booleans", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const visible = await prisma.recognition.findFirst({
      where: { id, companyId, ...recognitionVisibleWhere(self) },
      select: { id: true },
    });
    if (!visible)
      return withCors(ApiResponse.error("Recognition not found", 404), origin);

    const set = async (type: "LIKE" | "CELEBRATE", on: boolean | undefined) => {
      if (on === undefined) return;
      const row = { recognitionId: id, staffRecordId: self.id, type };
      if (on)
        await prisma.recognitionReaction.upsert({
          where: { recognitionId_staffRecordId_type: row },
          create: row,
          update: {},
        });
      else await prisma.recognitionReaction.deleteMany({ where: row });
    };
    await set("LIKE", liked);
    await set("CELEBRATE", celebrated);

    const rec = await prisma.recognition.findUniqueOrThrow({
      where: { id },
      select: recognitionSelect,
    });
    const s = serializeRecognition(rec, self.id);
    return withCors(
      ApiResponse.success(
        {
          liked: s.liked,
          celebrated: s.celebrated,
          likes: s.likes,
          celebrations: s.celebrations,
        },
        "Updated successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
