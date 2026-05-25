// src/app/api/jobs/create/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { requireModuleAccess } from "@/app/lib/module-access";
import { ApiResponse, formatError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type Location = {
  state: string;
  lga: string;
};

type CreateJobBody = {
  title?: string;
  description?: string;
  department?: string;
  position?: string;
  employmentType?: string;
  workplaceType?: string;
  experienceLevel?: string;
  salaryRange?: string;
  benefits?: string[];
  locations?: Location[];
  expirationDate?: string | null;
  status?: "DRAFT" | "ACTIVE" | "CLOSED" | "EXPIRED";
  companyId?: string;
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
    const user = await requireModuleAccess(token, 'RECRUITMENT', ["HR", "SUPER_ADMIN", "ADMIN"]);

    let body: CreateJobBody;
    try {
      body = (await request.json()) as CreateJobBody;
    } catch {
      return withCors(ApiResponse.error("Invalid JSON body", 400), origin);
    }

    let companyId: string | null = null;

    // Determine company based on user role
    if (user.role === "HR") {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error("Company context missing for HR user", 400),
          origin
        );
      }
      companyId = user.companyId;
    } else if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
      if (!body.companyId) {
        return withCors(
          ApiResponse.error("Company selection is required. Please select a company from the dropdown.", 400),
          origin
        );
      }
      companyId = body.companyId;

      if (user.role === "ADMIN") {
        const hasAccess = await prisma.userCompany.findFirst({
          where: {
            userId: user.userId,
            companyId: body.companyId!,
            role: { in: ["ADMIN", "ALL"] }
          }
        });

        if (!hasAccess) {
          return withCors(
            ApiResponse.error("You do not have access to create jobs for this company", 403),
            origin
          );
        }
      }
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error("Company context is missing", 400),
        origin
      );
    }

    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        archived: 0
      }
    });

    if (!company) {
      return withCors(
        ApiResponse.error("Company not found or is archived", 404),
        origin
      );
    }

    // Extract and validate required fields
    const title = body.title?.trim();
    const description = body.description?.trim();
    const department = body.department?.trim();
    const position = body.position?.trim();

    if (!title) return withCors(ApiResponse.error("Title is required", 400), origin);
    if (!description) return withCors(ApiResponse.error("Description is required", 400), origin);
    if (!department) return withCors(ApiResponse.error("Department is required", 400), origin);
    if (!position) return withCors(ApiResponse.error("Position is required", 400), origin);

    // Parse optional fields
    const expirationDate = parseDate(body.expirationDate ?? null);
    if (body.expirationDate && !expirationDate) {
      return withCors(
        ApiResponse.error("Invalid expirationDate. Use a valid date (YYYY-MM-DD).", 400),
        origin
      );
    }

    const status = normalizeStatus(body.status) ?? "ACTIVE";

    // Prepare benefits and locations as JSON
    const benefits = body.benefits && body.benefits.length > 0 ? body.benefits : undefined;
    const locations = body.locations && body.locations.length > 0 ? body.locations : undefined;

    // Optional: Prevent duplicate job spam
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const duplicate = await prisma.job.findFirst({
      where: {
        companyId: companyId!,
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

    // Create the job with all fields
    const job = await prisma.job.create({
      data: {
        title,
        description,
        department,
        position,
        companyId: companyId!,
        employmentType: body.employmentType,
        workplaceType: body.workplaceType,
        experienceLevel: body.experienceLevel,
        salaryRange: body.salaryRange,
        benefits: benefits ? JSON.parse(JSON.stringify(benefits)) : undefined,
        locations: locations ? JSON.parse(JSON.stringify(locations)) : undefined,
        expirationDate,
        status: status as any,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });

    console.log(`[JOB_CREATE] Job created: ${job.id} for company ${companyId} (${company.companyName}) by ${user.role}:${user.email}`);

    return withCors(
      ApiResponse.success({ 
        job,
        metadata: {
          userRole: user.role,
          companyId: companyId,
          companyName: company.companyName
        }
      }, "Job created successfully"),
      origin
    );

  } catch (error) {
    console.error("[JOB_CREATE] Error:", error);
    return withCors(ApiResponse.error(formatError(error), 500), origin);
  }
}