import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const TONES: Record<string, "success" | "brand" | "danger" | "muted"> = {
  PUBLISHED: "success",
  ASSIGNED: "success",
  CREATED: "brand",
  DUPLICATED: "brand",
  EDITED: "brand",
  EDITED_VIA_NEW_DRAFT: "brand",
  METADATA_UPDATED: "brand",
  ARCHIVED: "danger",
  UNASSIGNED: "danger",
};

function labelFor(
  action: string,
  name: string,
  version: string,
  cycleName?: string,
) {
  switch (action) {
    case "CREATED":
      return `Created: ${name}`;
    case "EDITED":
      return `Draft saved: ${name}${version ? ` (${version})` : ""}`;
    case "EDITED_VIA_NEW_DRAFT":
      return `New draft started: ${name}${version ? ` (${version})` : ""}`;
    case "PUBLISHED":
      return `${version ? `${version} published` : "Published"}: ${name}`;
    case "DUPLICATED":
      return `Duplicated: ${name}`;
    case "ARCHIVED":
      return `Archived: ${name}`;
    case "METADATA_UPDATED":
      return `Details updated: ${name}`;
    case "ASSIGNED":
      return `Assigned: ${name}${cycleName ? ` to ${cycleName}` : ""}`;
    case "UNASSIGNED":
      return `Unassigned: ${name}`;
    default:
      return `${action}: ${name}`;
  }
}

// GET /api/review-templates/activity?companyId=xxx&limit=5
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
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

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

    const limitParam = parseInt(searchParams.get("limit") ?? "", 10);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 20)
        : 5;

    // Fetch extra rows: repeated draft saves are collapsed below
    const rows = await prisma.templateHistory.findMany({
      where: {
        OR: [{ companyId }, { companyId: null, template: { companyId } }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit * 6,
      select: {
        id: true,
        templateId: true,
        versionId: true,
        action: true,
        createdAt: true,
        newData: true,
        template: { select: { name: true } },
        actor: { select: { firstName: true, lastName: true } },
      },
    });

    const versionIds = [
      ...new Set(rows.map((r) => r.versionId).filter((x): x is string => !!x)),
    ];
    const versions = versionIds.length
      ? await prisma.reviewTemplateVersion.findMany({
          where: { id: { in: versionIds } },
          select: { id: true, versionNumber: true },
        })
      : [];
    const versionNumber = new Map(versions.map((v) => [v.id, v.versionNumber]));

    const items: {
      id: string;
      templateId: string;
      label: string;
      action: string;
      tone: string;
      by: string;
      createdAt: Date;
    }[] = [];

    for (const r of rows) {
      const prev = items[items.length - 1];
      // Collapse consecutive draft saves on the same template within 30 minutes
      if (
        prev &&
        r.action === "EDITED" &&
        prev.action === "EDITED" &&
        prev.templateId === r.templateId &&
        prev.createdAt.getTime() - r.createdAt.getTime() < 30 * 60 * 1000
      ) {
        continue;
      }
      const v = r.versionId ? versionNumber.get(r.versionId) : undefined;
      const cycleName = (r.newData as any)?.cycleName as string | undefined;
      items.push({
        id: r.id,
        templateId: r.templateId,
        label: labelFor(r.action, r.template.name, v ? `v${v}` : "", cycleName),
        action: r.action,
        tone: TONES[r.action] ?? "muted",
        by: `${r.actor.firstName} ${r.actor.lastName}`,
        createdAt: r.createdAt,
      });
      if (items.length >= limit) break;
    }

    return withCors(
      ApiResponse.success(items, "Template activity fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
