// src/app/api/jobs/public/view/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { ApiResponse, formatError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const { searchParams } = new URL(request.url);

    // Pagination (safe)
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSizeRaw = Number(searchParams.get("pageSize") || "20");
    const pageSize = Math.min(Math.max(1, pageSizeRaw || 20), 50); // clamp 1..50

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Optional: public search
    const search = (searchParams.get("search") || "").trim();
    const now = new Date();

    // New model adjustment:
    // - expirationDate is optional, so we include:
    //   (expirationDate >= now) OR (expirationDate is null)
    const where: any = {
      status: "ACTIVE",
      OR: [
        { expirationDate: { gte: now } },
        { expirationDate: null },
      ],
    };

    // If you want to show expired jobs too, remove the OR above entirely.
    // Or add a query param showExpired=1.

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { department: { contains: search, mode: "insensitive" } },
            { position: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { company: { companyName: { contains: search, mode: "insensitive" } } },
          ],
        },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          title: true,
          department: true,
          position: true,
          description: true,
          createdAt: true,
          expirationDate: true,
          company: {
            select: {
              companyName: true,
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / take));

    const publicJobs = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      department: job.department,
      position: job.position,
      description: job.description,
      companyName: job.company?.companyName ?? null,
      publishedAt: job.createdAt,
      expirationDate: job.expirationDate, // can be null
    }));

    return withCors(
      ApiResponse.success(
        {
          pagination: {
            total,
            page,
            pageSize: take,
            totalPages,
          },
          filters: {
            search: search || null,
          },
          jobs: publicJobs,
        },
        "Public jobs fetched successfully"
      ),
      origin
    );
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}
