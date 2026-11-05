import { NextRequest } from "next/server";

import { getUserFromToken } from "@/app/lib/auth";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
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
      grade,
      description,
      rank,
      seniorityBand,
      minSalary,
      maxSalary,
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

    const validBands = ['ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'DIRECTOR', 'EXECUTIVE'];
    if (seniorityBand && validBands.includes(String(seniorityBand).toUpperCase())) {
      data.seniorityBand = String(seniorityBand).toUpperCase();
    } else if (grade && validBands.includes(String(grade).toUpperCase())) {
      data.seniorityBand = String(grade).toUpperCase();
    }

    if (rank !== undefined && rank !== null && !isNaN(Number(rank))) {
      data.rank = Math.max(1, Number(rank));
    }

    if (minSalary !== undefined) {
      data.minSalary = minSalary === null || minSalary === "" ? null : Number(minSalary);
    }
    if (maxSalary !== undefined) {
      data.maxSalary = maxSalary === null || maxSalary === "" ? null : Number(maxSalary);
    }
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
          rank: updated.rank,
          seniorityBand: updated.seniorityBand,
          grade: updated.seniorityBand,
          hasGradeLevel: false,
          basePay: updated.basePay ?? null,
          basePayFrequency: updated.basePayFrequency ?? null,
          minSalary: updated.minSalary != null ? Number(updated.minSalary) : null,
          maxSalary: updated.maxSalary != null ? Number(updated.maxSalary) : null,
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
