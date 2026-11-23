import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { notFound, ok, readCtx } from "@/app/lib/pip";
import { loadScopedStaff } from "@/app/lib/promotion";
import { forCompany } from "@/app/lib/data/tenant";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/targets?companyId&staffRecordId?   Replaces the modal's hardcoded role lists (decision 8)
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

    const designations = await forCompany(companyId).designation.findMany({
      where: { status: "Active" },
      orderBy: [{ title: "asc" }],
      take: 500,
      select: {
        id: true,
        title: true,
        code: true,
        basePay: true,
        department: { select: { id: true, name: true } },
      },
    });

    return ok(origin, {
      designations: designations.map((d) => ({
        id: d.id,
        title: d.title,
        code: d.code,
        basePay: d.basePay ? Number(d.basePay) : null,
        departmentName: d.department?.name ?? null,
      })),
      current: staff && {
        designationId: staff.designationId,
        roleTitle: staff.designation?.title ?? staff.position,
        basePay: staff.designation?.basePay ? Number(staff.designation.basePay) : null,
      },
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
