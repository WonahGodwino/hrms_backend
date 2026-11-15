import { NextRequest } from "next/server";

import { getUserFromToken } from "@/app/lib/auth";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { logRecordChange } from "@/app/lib/core-setup/audit";
import { prisma } from "@/app/lib/db";
import { normalizeFrequency } from "@/app/lib/designations/helpers";
import { ApiResponse, handleApiError } from "@/app/lib/utils";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = req.headers.get("origin");
  try {
    const token =
      req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    if (!token)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user = await getUserFromToken(token);
    if (!user || !["ADMIN", "HR", "SUPER_ADMIN"].includes(user.role))
      return withCors(ApiResponse.error("Unauthorized", 403), origin);

    const { id } = await params;
    const {
      title,
      code,
      description,
      basePay,
      basePayFrequency,
      benefits,
      companyId: bodyCompanyId,
      departmentId,
    } = await req.json();

    // Honour the global company selector (query param) so SUPER_ADMIN and
    // multi-company ADMIN updates are scoped to the selected company.
    const { searchParams } = new URL(req.url);
    const companyId =
      user.role === "SUPER_ADMIN"
        ? searchParams.get("companyId") || bodyCompanyId || undefined
        : user.companyId;
    const existing = await (prisma as any).designation.findUnique({
      where: { id },
    });
    if (!existing || (companyId && existing.companyId !== companyId))
      return withCors(ApiResponse.error("Designation not found", 404), origin);

    if (code && code !== existing.code) {
      const dup = await (prisma as any).designation.findFirst({
        where: { code, companyId: companyId || null, id: { not: id } },
      });
      if (dup)
        return withCors(
          ApiResponse.error(`Code "${code}" already exists`, 409),
          origin,
        );
    }

    const data: any = {
      ...(title ? { title } : {}),
      ...(code ? { code } : {}),
      ...(departmentId !== undefined
        ? { departmentId: departmentId || null }
        : {}),
      ...(description !== undefined ? { description } : {}),
      ...(benefits !== undefined ? { benefits } : {}),
    };

    if (basePay !== undefined) {
      data.basePay = basePay === null || basePay === "" ? null : Number(basePay);
    }
    if (basePayFrequency !== undefined) {
      data.basePayFrequency = normalizeFrequency(basePayFrequency);
    }

    const updated = await (prisma as any).designation.update({
      where: { id },
      data,
    });

    const pick = (d: any) => ({
      id: d.id,
      title: d.title,
      code: d.code,
      description: d.description,
      basePay: d.basePay,
      basePayFrequency: d.basePayFrequency,
      status: d.status,
    });
    await logRecordChange(req, user, {
      companyId: existing.companyId,
      noun: "Designation",
      type: "designation",
      before: pick(existing),
      after: pick(updated),
    });

    if (title && title !== existing.title) {
      await prisma.staffRecord.updateMany({
        where: { designationId: id, companyId: existing.companyId },
        data: { position: updated.title },
      });
    }

    return withCors(
      ApiResponse.success(
        {
          id: updated.id,
          title: updated.title,
          code: updated.code,
          basePay: updated.basePay ?? null,
          basePayFrequency: updated.basePayFrequency ?? null,
          benefits: updated.benefits ?? null,
          description: updated.description,
          status: updated.status,
        },
        "Designation updated",
      ),
      origin,
    );
  } catch (e) {
    return withCors(handleApiError(e), origin);
  }
}
