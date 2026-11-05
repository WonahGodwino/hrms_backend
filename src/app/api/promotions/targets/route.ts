import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { notFound, ok, readCtx } from "@/app/lib/pip";
import { loadScopedStaff } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/targets?companyId&staffRecordId?   Replaces the modal's hardcoded role and grade lists (decision 8)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const staffRecordId = sp.get("staffRecordId");

    const staff = staffRecordId
      ? await loadScopedStaff(prisma, companyId, staffRecordId, actor)
      : null;
    if (staffRecordId && !staff) return notFound(origin, "Employee");

    const designations = await prisma.designation.findMany({
      where: { companyId, status: "Active" },
      orderBy: [{ rank: "asc" }, { title: "asc" }],
      take: 500,
      select: {
        id: true,
        title: true,
        code: true,
        rank: true,
        seniorityBand: true,
        basePay: true,
        minSalary: true,
        maxSalary: true,
        department: { select: { id: true, name: true } },
      },
    });

    return ok(origin, {
      designations: designations.map((d) => ({
        id: d.id,
        title: d.title,
        code: d.code,
        rank: d.rank,
        seniorityBand: d.seniorityBand,
        basePay: d.basePay ? Number(d.basePay) : null,
        minSalary: d.minSalary ? Number(d.minSalary) : null,
        maxSalary: d.maxSalary ? Number(d.maxSalary) : null,
        gradeName: d.seniorityBand,
        gradeLevelId: d.id,
        hasGradeLevel: false,
        departmentName: d.department?.name ?? null,
      })),
      grades: designations.map((d) => ({
        id: d.id,
        name: `${d.title} (${d.seniorityBand})`,
        rank: d.rank,
      })),
      current: staff && {
        designationId: staff.designationId,
        roleTitle: staff.designation?.title ?? staff.position,
        rank: staff.designation?.rank ?? 1,
        seniorityBand: staff.designation?.seniorityBand ?? "MID",
        basePay: staff.designation?.basePay ? Number(staff.designation.basePay) : null,
        gradeId: staff.designationId ?? null,
        gradeName: staff.designation?.seniorityBand ?? null,
        gradeRank: staff.designation?.rank ?? 1,
      },
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
