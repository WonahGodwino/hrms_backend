// GET/POST /api/recruitment/jobs/board-distribution (authenticated) — backs
// the HR Jobs Dashboard's "Distribution" panel: the company's external
// job-board feed URL (LinkedIn Job Wrapping, Jobberman, Indeed, Jooble,
// Careerjet, Jora, Talent.com all ingest it) plus recent publish/close/pull
// activity from JobBoardDeliveryLog.
import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { ApiResponse, formatError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { requireModuleAccess } from "@/app/lib/module-access";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function resolveCompanyId(request: NextRequest, user: any): Promise<string | null> {
  const { searchParams } = new URL(request.url);
  return searchParams.get("companyId") || user.companyId || null;
}

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || "https://247hr.co.uk";

function feedUrls(companyId: string, token: string) {
  const base = `${(process.env.BACKEND_URL || FRONTEND_URL).replace(/\/$/, "")}/api/recruitment/jobs/public/feed`;
  return {
    xml: `${base}?companyId=${companyId}&token=${token}&format=xml`,
    json: `${base}?companyId=${companyId}&token=${token}&format=json`,
  };
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) return withCors(ApiResponse.error("Authorization header missing", 401), origin);
    const user = await requireModuleAccess(token, "RECRUITMENT", ["HR", "ADMIN", "SUPER_ADMIN"]);

    const companyId = await resolveCompanyId(request, user);
    if (!companyId) return withCors(ApiResponse.error("Company context missing", 400), origin);

    let company = await prisma.company.findFirst({
      where: { id: companyId, archived: 0 },
      select: { id: true, jobFeedToken: true },
    });
    if (!company) return withCors(ApiResponse.error("Company not found", 404), origin);

    if (!company.jobFeedToken) {
      const generated = randomBytes(24).toString("hex");
      company = await prisma.company.update({
        where: { id: companyId },
        data: { jobFeedToken: generated },
        select: { id: true, jobFeedToken: true },
      });
    }

    const logs = await prisma.jobBoardDeliveryLog.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { job: { select: { title: true } } },
    });

    return withCors(
      ApiResponse.success({
        feedUrls: feedUrls(companyId, company.jobFeedToken!),
        recentActivity: logs.map((l) => ({
          id: l.id,
          channel: l.channel,
          event: l.event,
          status: l.status,
          jobTitle: l.job?.title || null,
          createdAt: l.createdAt,
        })),
      }),
      origin
    );
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) return withCors(ApiResponse.error("Authorization header missing", 401), origin);
    const user = await requireModuleAccess(token, "RECRUITMENT", ["HR", "ADMIN", "SUPER_ADMIN"]);

    const companyId = await resolveCompanyId(request, user);
    if (!companyId) return withCors(ApiResponse.error("Company context missing", 400), origin);

    const generated = randomBytes(24).toString("hex");
    const company = await prisma.company.update({
      where: { id: companyId },
      data: { jobFeedToken: generated },
      select: { id: true, jobFeedToken: true },
    });

    return withCors(
      ApiResponse.success({ feedUrls: feedUrls(companyId, company.jobFeedToken!) }, "Feed token regenerated"),
      origin
    );
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}
