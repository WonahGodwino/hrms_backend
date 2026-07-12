// GET /api/recruitment/jobs/public/detail?jobId=...  (PUBLIC)
// Returns a single active job with real company info and related roles, so the
// public job-details page can render without any mocked data.
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { ApiResponse, formatError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// Normalise the Json `locations` field into a readable label.
const toLocationLabel = (locations: any, workplaceType?: string | null): string => {
  const parts: string[] = [];
  let list = locations;
  if (typeof list === "string") {
    try { list = JSON.parse(list); } catch { list = null; }
  }
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0] || {};
    const loc = [first.lga, first.state].filter(Boolean).join(", ");
    if (loc) parts.push(loc);
    if (list.length > 1) parts.push(`+${list.length - 1} more`);
  }
  if (workplaceType) parts.unshift(workplaceType);
  return parts.join(" · ") || (workplaceType || "");
};

// Normalise the Json `benefits` field into a clean string array.
const toBenefits = (benefits: any): string[] => {
  let list = benefits;
  if (typeof list === "string") {
    try { list = JSON.parse(list); } catch { list = null; }
  }
  if (!Array.isArray(list)) return [];
  return list.map((b) => String(b || "").trim()).filter(Boolean);
};

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const { searchParams } = new URL(request.url);
    const jobId = (searchParams.get("jobId") || "").trim();
    if (!jobId) {
      return withCors(ApiResponse.error("jobId is required", 400), origin);
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, status: "ACTIVE", archived: 0, company: { archived: 0 } },
      select: {
        id: true,
        title: true,
        description: true,
        department: true,
        position: true,
        employmentType: true,
        workplaceType: true,
        experienceLevel: true,
        salaryRange: true,
        benefits: true,
        locations: true,
        createdAt: true,
        expirationDate: true,
        companyId: true,
        company: {
          select: {
            companyName: true,
            industry: true,
            website: true,
            biography: true,
            logo: true,
          },
        },
      },
    });

    if (!job) {
      return withCors(ApiResponse.error("Job not found", 404), origin);
    }

    // Related roles: other active, non-expired jobs from the same company or the
    // same department (company matches take priority via ordering).
    const now = new Date();
    const related = await prisma.job.findMany({
      where: {
        id: { not: job.id },
        status: "ACTIVE",
        archived: 0,
        company: { archived: 0 },
        OR: [{ companyId: job.companyId }, { department: job.department }],
        AND: [{ OR: [{ expirationDate: { gte: now } }, { expirationDate: null }] }],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        department: true,
        employmentType: true,
        workplaceType: true,
        salaryRange: true,
        locations: true,
        companyId: true,
        company: { select: { companyName: true } },
      },
    });

    // Prioritise same-company matches, then cap at 4.
    const relatedJobs = related
      .sort((a, b) => {
        const aSame = a.companyId === job.companyId ? 0 : 1;
        const bSame = b.companyId === job.companyId ? 0 : 1;
        return aSame - bSame;
      })
      .slice(0, 4)
      .map((r) => ({
        id: r.id,
        title: r.title,
        companyName: r.company?.companyName ?? null,
        department: r.department,
        employmentType: r.employmentType || null,
        salaryRange: r.salaryRange || null,
        locationLabel: toLocationLabel(r.locations, r.workplaceType),
      }));

    const payload = {
      job: {
        id: job.id,
        title: job.title,
        description: job.description,
        department: job.department,
        position: job.position,
        employmentType: job.employmentType || null,
        workplaceType: job.workplaceType || null,
        experienceLevel: job.experienceLevel || null,
        salaryRange: job.salaryRange || null,
        benefits: toBenefits(job.benefits),
        locationLabel: toLocationLabel(job.locations, job.workplaceType),
        companyName: job.company?.companyName ?? null,
        publishedAt: job.createdAt,
        expirationDate: job.expirationDate,
      },
      company: {
        name: job.company?.companyName ?? null,
        industry: job.company?.industry || null,
        website: job.company?.website || null,
        biography: job.company?.biography || null,
        logo: job.company?.logo || null,
      },
      relatedJobs,
    };

    return withCors(
      ApiResponse.success(payload, "Public job detail fetched successfully"),
      origin
    );
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}
