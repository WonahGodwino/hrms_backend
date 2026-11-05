import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  PHASE_LABEL,
  logCycleAction,
} from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// Excel runs cells that start with = + - @ as formulas, so neutralise them.
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : "";
const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

// GET /api/appraisal-cycles/:id/export?companyId=...  -> participant progress CSV
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: {
        id: true,
        name: true,
        phases: {
          where: { enabled: true },
          orderBy: { displayOrder: "asc" },
          select: { phaseType: true },
        },
      },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const participants = await prisma.appraisalCycleParticipant.findMany({
      where: { cycleId: cycle.id },
      select: {
        departmentId: true,
        managerId: true,
        staffRecord: {
          select: { staffId: true, firstName: true, lastName: true },
        },
        phases: {
          select: { phaseType: true, status: true, completedAt: true },
        },
      },
      orderBy: { staffRecord: { firstName: "asc" } },
    });

    const deptIds = [
      ...new Set(
        participants.map((p) => p.departmentId).filter((x): x is string => !!x),
      ),
    ];
    const managerIds = [
      ...new Set(
        participants.map((p) => p.managerId).filter((x): x is string => !!x),
      ),
    ];
    const [departments, managers] = await Promise.all([
      deptIds.length
        ? prisma.department.findMany({
            where: { id: { in: deptIds }, companyId },
            select: { id: true, name: true },
          })
        : [],
      managerIds.length
        ? prisma.staffRecord.findMany({
            where: { id: { in: managerIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const managerName = new Map(
      managers.map((m) => [m.id, `${m.firstName} ${m.lastName}`]),
    );

    const header = [
      "Staff ID",
      "Employee",
      "Department",
      "Manager",
      ...cycle.phases.flatMap((p) => {
        const label = PHASE_LABEL[p.phaseType] ?? p.phaseType;
        return [`${label} status`, `${label} completed on`];
      }),
      "Overall",
    ];

    const rows = participants.map((p) => {
      const byType = new Map(
        p.phases.map((ph) => [ph.phaseType as string, ph]),
      );
      const states = cycle.phases.map(
        (cp) => byType.get(cp.phaseType)?.status ?? "NOT_STARTED",
      );
      const overall =
        states.length > 0 && states.every((s) => s === "COMPLETED")
          ? "Completed"
          : states.every((s) => s === "NOT_STARTED")
            ? "Not started"
            : "In progress";
      return [
        p.staffRecord.staffId ?? "",
        `${p.staffRecord.firstName} ${p.staffRecord.lastName}`,
        p.departmentId ? (deptName.get(p.departmentId) ?? "") : "",
        p.managerId ? (managerName.get(p.managerId) ?? "") : "",
        ...cycle.phases.flatMap((cp) => {
          const ph = byType.get(cp.phaseType);
          return [
            STATUS_LABEL[ph?.status ?? "NOT_STARTED"],
            day(ph?.completedAt),
          ];
        }),
        overall,
      ];
    });

    // BOM so Excel reads accented names as UTF-8
    const csv =
      "\uFEFF" +
      [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const safeName =
      cycle.name
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "-") || "cycle";

    await logCycleAction(prisma as any, {
      cycleId: cycle.id,
      companyId,
      action: "REPORT_EXPORTED",
      actorId: user.userId,
      newData: { rows: rows.length },
    }).catch(() => undefined);

    return withCors(
      new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}-progress-${day(new Date())}.csv"`,
          "Cache-Control": "no-store",
        },
      }),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
