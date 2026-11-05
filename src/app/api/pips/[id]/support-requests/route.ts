import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { nameOf, ok, pipScope, readCtx } from "@/app/lib/pip";
import { Params, bail, guarded } from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const r = await readCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    if (!r.ok) return r.response;
    const pip = await prisma.pip.findFirst({
      where: { id, companyId: r.ctx.companyId, ...pipScope(r.ctx.actor) },
      select: { id: true },
    });
    if (!pip) return bail(404, "PIP not found");
    const rows = await prisma.pipSupportRequest.findMany({
      where: { pipId: id },
      orderBy: { createdAt: "desc" },
      include: { staffRecord: { select: { firstName: true, lastName: true } } },
    });
    return ok(
      origin,
      rows.map(({ staffRecord, ...x }) => ({
        ...x,
        requesterName: nameOf(staffRecord),
      })),
    );
  });
}
