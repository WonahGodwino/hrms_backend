//api/recruitment/jobs/[id]/edit/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";

import { requireModuleAccess } from "@/app/lib/module-access";
import { ApiResponse } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { sanitizeOfferDefaults } from "@/app/lib/jobs/offer-defaults";
import { parseSalaryAmount } from "@/app/lib/recruitment/job-salary";
import { checkJobPermission } from "@/app/lib/recruitment/companyScope";
import { publicErrorMessage } from "@/app/lib/errors/public-error";
import { forCompany } from "@/app/lib/data/tenant";
import { extractBearerToken } from "@/app/lib/recruitment/route-helpers";

type UpdateJobBody = {
  title?: string;
  description?: string;
  department?: string;
  position?: string;
  expirationDate?: string | null;
  offerDefaults?: Record<string, unknown>;
  employmentType?: string | null;
  workplaceType?: string | null;
  experienceLevel?: string | null;
  salary?: number | string | null;
  locations?: unknown;
  status?: string;
  designationId?: string | null;
  departmentId?: string | null;
};

const ALLOWED_STATUSES = ["ACTIVE", "DRAFT", "CLOSED", "EXPIRED"];



function mapAuthErrorStatus(message: string): number {
  return message.toLowerCase().includes("insufficient permissions") ? 403 : 401;
}

function parseDate(value?: string | null): Date | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// Edit one job at a time.
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = request.headers.get("origin");
  const jobId = params.id;

  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return withCors(
        ApiResponse.error("Invalid or missing Authorization header", 401),
        origin,
      );
    }

    let user;
    try {
      user = await requireModuleAccess(token, "RECRUITMENT", [
        "HR",
        "ADMIN",
        "SUPER_ADMIN",
      ]);
    } catch (authError) {
      const message = publicErrorMessage(authError);
      return withCors(
        ApiResponse.error(message, mapAuthErrorStatus(message)),
        origin,
      );
    }

    let body: UpdateJobBody;
    try {
      body = (await request.json()) as UpdateJobBody;
    } catch {
      return withCors(ApiResponse.error("Invalid JSON body", 400), origin);
    }

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        company: { archived: 0 },
      },
      select: {
        id: true,
        companyId: true,
        createdBy: true,
        status: true,
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!job) {
      return withCors(ApiResponse.error("Job not found", 404), origin);
    }

    const hasPermission = await checkJobPermission(user, job.companyId, job.createdBy);
    if (!hasPermission) {
      return withCors(
        ApiResponse.error("You cannot update this job", 403),
        origin,
      );
    }

    const data: Record<string, unknown> = {
      updatedBy: user.userId,
      updatedAt: new Date(),
    };

    // Resolve the designation this vacancy recruits for. Its name is the
    // fallback title/position when the author leaves the title blank.
    let designationTitle: string | null = null;
    if (body.designationId !== undefined) {
      const desigId = body.designationId
        ? String(body.designationId).trim()
        : "";
      if (desigId) {
        const designation = await forCompany(job.companyId).designation.findFirst({
          where: { id: desigId },
          select: { id: true, title: true },
        });
        if (!designation) {
          return withCors(
            ApiResponse.error(
              "Selected designation was not found for this company",
              400,
            ),
            origin,
          );
        }
        data.designationId = desigId;
        designationTitle = designation.title;
      } else {
        data.designationId = null;
      }
    }

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        // Blank title falls back to the designation name (if one is set).
        if (!designationTitle) {
          return withCors(
            ApiResponse.error("Enter a job title or select a designation", 400),
            origin,
          );
        }
        data.title = designationTitle;
      } else {
        data.title = title;
      }
      // Keep position aligned with the title unless one is explicitly provided.
      if (typeof body.position !== "string" || !body.position.trim()) {
        data.position = data.title;
      }
    }

    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (!description) {
        return withCors(
          ApiResponse.error("Description cannot be empty", 400),
          origin,
        );
      }
      data.description = description;
    }

    if (typeof body.department === "string") {
      const department = body.department.trim();
      if (!department) {
        return withCors(
          ApiResponse.error("Department cannot be empty", 400),
          origin,
        );
      }
      data.department = department;
    }

    // Keep the department FK in sync — prefer an explicit id, else resolve by
    // the (new or existing) department name within the company.
    if (
      body.departmentId !== undefined ||
      typeof body.department === "string"
    ) {
      let deptId: string | null = null;
      const requestedDeptId = body.departmentId
        ? String(body.departmentId).trim()
        : "";
      if (requestedDeptId) {
        const dep = await forCompany(job.companyId).department.findFirst({
          where: { id: requestedDeptId },
          select: { id: true },
        });
        deptId = dep?.id || null;
      } else if (
        typeof body.department === "string" &&
        body.department.trim()
      ) {
        const dep = await forCompany(job.companyId).department.findFirst({
          where: {
            name: { equals: body.department.trim(), mode: "insensitive" },
          },
          select: { id: true },
        });
        deptId = dep?.id || null;
      }
      data.departmentId = deptId;
    }

    if (typeof body.position === "string") {
      const position = body.position.trim();
      if (!position) {
        return withCors(
          ApiResponse.error("Position cannot be empty", 400),
          origin,
        );
      }
      data.position = position;
    }

    if (body.expirationDate !== undefined) {
      if (body.expirationDate === null || body.expirationDate.trim() === "") {
        data.expirationDate = null;
      } else {
        const parsedDate = parseDate(body.expirationDate);
        if (!parsedDate) {
          return withCors(
            ApiResponse.error(
              "Invalid expirationDate. Use a valid date string.",
              400,
            ),
            origin,
          );
        }
        data.expirationDate = parsedDate;
      }
    }

    if (body.offerDefaults !== undefined) {
      // Merge the whitelisted employment-term defaults for the offer letter.
      data.offerDefaults =
        sanitizeOfferDefaults(body.offerDefaults) ?? undefined;
    }

    // Optional string fields — empty string clears them to null.
    const optionalStrings: Array<keyof UpdateJobBody> = [
      "employmentType",
      "workplaceType",
      "experienceLevel",
    ];
    for (const field of optionalStrings) {
      const value = body[field];
      if (value !== undefined) {
        data[field] =
          typeof value === "string" && value.trim() ? value.trim() : null;
      }
    }

    // Single numeric salary; empty clears it. Also drops the legacy free-text
    // range so the old value can't resurface as a fallback.
    if (body.salary !== undefined) {
      if (body.salary === null || String(body.salary).trim() === "") {
        data.salary = null;
      } else {
        const amount = parseSalaryAmount(body.salary);
        if (amount === null) {
          return withCors(
            ApiResponse.error(
              "Salary must be a single numeric amount (no ranges).",
              400,
            ),
            origin,
          );
        }
        data.salary = amount;
      }
      data.salaryRange = null;
    }

    if (body.locations !== undefined) {
      // Persist the postings array as-is (Json column); strip any UI-only keys.
      if (Array.isArray(body.locations)) {
        data.locations = body.locations
          .map((loc: any) => ({
            state: loc?.state ?? "",
            lga: loc?.lga ?? "",
            ...(loc?.city ? { city: String(loc.city) } : {}),
          }))
          .filter((loc: any) => loc.state || loc.lga);
      } else {
        data.locations = body.locations ?? null;
      }
    }

    if (body.status !== undefined) {
      const status = String(body.status).trim().toUpperCase();
      if (!ALLOWED_STATUSES.includes(status)) {
        return withCors(ApiResponse.error("Invalid status value", 400), origin);
      }
      data.status = status;
      if (status === "ACTIVE" && job.status !== "ACTIVE")
        data.publishedAt = new Date();
    }

    if (Object.keys(data).length === 2) {
      return withCors(
        ApiResponse.error("No editable fields were provided", 400),
        origin,
      );
    }

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        department: true,
        position: true,
        companyId: true,
        status: true,
        expirationDate: true,
        updatedAt: true,
        updatedBy: true,
        company: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    return withCors(
      ApiResponse.success(
        {
          ...updatedJob,
          applicationCount: job._count.applications,
          editedBy: user.userId,
          editedAt: updatedJob.updatedAt,
        },
        "Job updated successfully",
      ),
      origin,
    );
  } catch (error) {
    const message = publicErrorMessage(error);
    console.error("[JOB_EDIT] Error:", error);
    return withCors(ApiResponse.error(message, 500), origin);
  }
}
