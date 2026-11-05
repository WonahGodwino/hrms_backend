import { NextRequest } from "next/server";
import { Prisma, PipSessionStatus } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  LIVE_PIP,
  SESSION_INCLUDE,
  fail,
  ok,
  person,
  pipLabel,
  pipScope,
  readCtx,
  serializeSession,
} from "@/app/lib/pip";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const PIP_SEL = {
  select: {
    id: true,
    number: true,
    status: true,
    staffRecord: {
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    },
  },
} as const;

// GET /api/pips/sessions?companyId=...&view=section
//   section: open PIPs only. SCHEDULED ascending (overdue first), then latest COMPLETED, capped at 5.
// GET /api/pips/sessions?companyId=...&pipId=&status=&page=1&pageSize=20
//   history: includes closed PIPs and CANCELLED sessions (decision 33).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const now = new Date();
    const shape = (s: any) => ({
      ...serializeSession(s, now),
      pip: {
        id: s.pip.id,
        label: pipLabel(s.pip.number),
        status: s.pip.status,
        employee: person(s.pip.staffRecord),
      },
    });
    const include = { ...SESSION_INCLUDE, pip: PIP_SEL };

    if (sp.get("view") === "section") {
      const pipWhere: Prisma.PipWhereInput = {
        companyId,
        ...pipScope(actor),
        status: { in: LIVE_PIP },
      };
      const scheduled = await prisma.pipCoachingSession.findMany({
        where: { pip: pipWhere, status: "SCHEDULED" },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        include,
      });
      const rest = 5 - scheduled.length;
      const completed =
        rest > 0
          ? await prisma.pipCoachingSession.findMany({
              where: { pip: pipWhere, status: "COMPLETED" },
              orderBy: { completedAt: "desc" },
              take: rest,
              include,
            })
          : [];
      return ok(origin, { sessions: [...scheduled, ...completed].map(shape) });
    }

    const status = sp.get("status");
    if (
      status &&
      !Object.values(PipSessionStatus).includes(status as PipSessionStatus)
    )
      return fail(
        origin,
        `status must be one of: ${Object.values(PipSessionStatus).join(", ")}`,
      );
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(sp.get("pageSize")) || 20),
    );
    const where: Prisma.PipCoachingSessionWhereInput = {
      pip: {
        companyId,
        ...pipScope(actor),
        ...(sp.get("pipId") ? { id: sp.get("pipId")! } : {}),
      },
      ...(status ? { status: status as PipSessionStatus } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.pipCoachingSession.count({ where }),
      prisma.pipCoachingSession.findMany({
        where,
        orderBy: { scheduledAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include,
      }),
    ]);
    return ok(origin, { sessions: rows.map(shape), total, page, pageSize });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
