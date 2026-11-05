// GET /api/recruitment/jobs/public/feed?companyId=...&token=...&format=xml|json
// (PUBLIC, unauthenticated) — the external job-board distribution feed.
// LinkedIn Job Wrapping, Jobberman, Indeed, Jooble, Careerjet, Jora and
// Talent.com all ingest this same feed; see lib/recruitment/job-feed.ts and
// the "Distribute job openings to external platforms" plan.
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { ApiResponse, formatError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { buildJobFeedXml, buildJobPostingJsonLd, type JobFeedJob } from "@/app/lib/recruitment/job-feed";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const { searchParams } = new URL(request.url);
    const companyId = (searchParams.get("companyId") || "").trim();
    const token = (searchParams.get("token") || "").trim();
    const format = (searchParams.get("format") || "xml").toLowerCase();

    if (!companyId) {
      return withCors(ApiResponse.error("companyId is required", 400), origin);
    }
    if (!["xml", "json"].includes(format)) {
      return withCors(ApiResponse.error("Invalid format. Use xml or json", 400), origin);
    }

    let company = await prisma.company.findFirst({
      where: { id: companyId, archived: 0 },
      select: { id: true, companyName: true, website: true, logo: true, jobFeedToken: true, baseCurrency: true },
    });
    if (!company) {
      return withCors(ApiResponse.error("Company not found", 404), origin);
    }

    // Lazily provision the feed token on first use so there's nothing to
    // configure before handing the URL to a job board.
    if (!company.jobFeedToken) {
      const generated = randomBytes(24).toString("hex");
      company = await prisma.company.update({
        where: { id: companyId },
        data: { jobFeedToken: generated },
        select: { id: true, companyName: true, website: true, logo: true, jobFeedToken: true, baseCurrency: true },
      });
    }

    if (!token || token !== company.jobFeedToken) {
      return withCors(ApiResponse.error("Invalid or missing feed token", 401), origin);
    }

    const now = new Date();
    const jobs = await prisma.job.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        archived: 0,
        OR: [{ expirationDate: { gte: now } }, { expirationDate: null }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        department: true,
        position: true,
        employmentType: true,
        workplaceType: true,
        experienceLevel: true,
        salary: true,
        salaryRange: true,
        locations: true,
        createdAt: true,
        expirationDate: true,
      },
    });

    const feedJobs: JobFeedJob[] = jobs.map((job) => ({ ...job, companyName: company!.companyName, currency: company!.baseCurrency }));

    // Best-effort delivery log; a logging failure must never break the feed
    // a crawler is actively fetching.
    void prisma.jobBoardDeliveryLog
      .create({
        data: {
          companyId,
          jobId: null,
          channel: "FEED_PULL",
          event: "PULLED",
          status: "PULLED",
          metadata: { format, jobCount: feedJobs.length, userAgent: request.headers.get("user-agent") || null },
        },
      })
      .catch(() => {});

    if (format === "json") {
      const payload = feedJobs.map((job) => buildJobPostingJsonLd(job, company!));
      return withCors(ApiResponse.success({ jobs: payload }, "Job feed fetched successfully"), origin);
    }

    const xml = buildJobFeedXml(feedJobs);
    return withCors(
      new NextResponse(xml, {
        status: 200,
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=1800" },
      }),
      origin
    );
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}
