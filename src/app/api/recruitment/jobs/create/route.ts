// src/app/api/jobs/create/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, formatError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type CreateJobBody = {
  title?: string;
  description?: string;
  department?: string;
  position?: string;
  expirationDate?: string | null; // optional, ISO string from form
  status?: "DRAFT" | "ACTIVE" | "CLOSED" | "EXPIRED"; // optional
};

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(value?: string): "DRAFT" | "ACTIVE" | "CLOSED" | "EXPIRED" | null {
  if (!value) return null;
  const s = value.trim().toUpperCase();
  if (s === "DRAFT" || s === "ACTIVE" || s === "CLOSED" || s === "EXPIRED") return s;
  return null;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return withCors(ApiResponse.error("Authorization header missing", 401), origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const user = requireRole(token, ["HR", "SUPER_ADMIN"]);

    if (!user.companyId) {
      return withCors(
        ApiResponse.error("Company context missing for this user", 400),
        origin
      );
    }

    const companyId = String(user.companyId);

    let body: CreateJobBody;
    try {
      body = (await request.json()) as CreateJobBody;
    } catch {
      return withCors(ApiResponse.error("Invalid JSON body", 400), origin);
    }

    const title = body.title?.trim();
    const description = body.description?.trim();
    const department = body.department?.trim();
    const position = body.position?.trim();

    if (!title) return withCors(ApiResponse.error("Title is required", 400), origin);
    if (!description) return withCors(ApiResponse.error("Description is required", 400), origin);
    if (!department) return withCors(ApiResponse.error("Department is required", 400), origin);
    if (!position) return withCors(ApiResponse.error("Position is required", 400), origin);

    const expirationDate = parseDate(body.expirationDate ?? null);
    if (body.expirationDate && !expirationDate) {
      return withCors(
        ApiResponse.error("Invalid expirationDate. Use a valid date (ISO preferred).", 400),
        origin
      );
    }

    const status = normalizeStatus(body.status) ?? "ACTIVE";

    // Optional HR standard: prevent duplicate job spam (same role posted recently)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const duplicate = await prisma.job.findFirst({
      where: {
        companyId,
        title,
        department,
        position,
        createdAt: { gte: since },
      },
      select: { id: true },
    });

    if (duplicate) {
      return withCors(
        ApiResponse.error(
          "A similar job has been created recently. Review existing postings before creating a new one.",
          409
        ),
        origin
      );
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        department,
        position,
        companyId,
        expirationDate, // nullable (fits improved model)
        status: status as any, // Prisma enum
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });

    return withCors(
      ApiResponse.success({ job }, "Job created successfully"),
      origin
    );
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}
