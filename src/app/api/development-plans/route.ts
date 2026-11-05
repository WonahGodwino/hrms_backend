import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  MAX_MILESTONES,
  MAX_TEXT,
  MAX_TITLE,
  PLAN_INCLUDE,
  authorize,
  findEligibleCoach,
  logDevAction,
  parseDate,
  parseMilestoneInput,
  resolveSubject,
  serializePlan,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/development-plans?companyId&staffRecordId?
// All non-archived plans of the employee (HR/Admin may pass staffRecordId).
// The list component keeps filtering by tab/search/competency client-side.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const subjectId = await resolveSubject(
      a.auth,
      searchParams.get("staffRecordId"),
    );
    if (!subjectId)
      return withCors(ApiResponse.notFound("Staff record not found"), origin);

    const plans = await prisma.developmentPlan.findMany({
      where: {
        companyId: a.auth.companyId,
        staffRecordId: subjectId,
        status: { not: "ARCHIVED" },
      },
      include: PLAN_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return withCors(
      ApiResponse.success(
        plans.map(serializePlan),
        "Development plans retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/development-plans
// body: { companyId, staffRecordId?, title, competencyId?, careerAlignment?,
//         mentorId?, targetDate?, description?, milestones?: [{ title, dueDate? }] }
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const bad = (m: string) => withCors(ApiResponse.error(m, 400), origin);
  try {
    const body = await request.json();
    const a = await authorize(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return bad("Missing required field: title");
    if (title.length > MAX_TITLE)
      return bad(`title must be ${MAX_TITLE} characters or fewer`);
    const careerAlignment =
      typeof body.careerAlignment === "string"
        ? body.careerAlignment.trim()
        : "";
    if (careerAlignment.length > MAX_TITLE)
      return bad(`careerAlignment must be ${MAX_TITLE} characters or fewer`);
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > MAX_TEXT)
      return bad(`description must be ${MAX_TEXT} characters or fewer`);

    const targetDate = body.targetDate ? parseDate(body.targetDate) : null;
    if (body.targetDate && !targetDate)
      return bad("targetDate must be a valid date (YYYY-MM-DD)");
    if (targetDate && targetDate < new Date())
      return bad("targetDate must be today or later");

    const rawMs: unknown = body.milestones ?? [];
    if (!Array.isArray(rawMs) || rawMs.length > MAX_MILESTONES)
      return bad(`milestones must be an array of at most ${MAX_MILESTONES}`);
    const milestones: { title: string; dueDate: Date | null }[] = [];
    for (const m of rawMs) {
      const parsed = parseMilestoneInput(m);
      if (!parsed)
        return bad(
          "Each milestone needs a title and an optional valid dueDate",
        );
      milestones.push(parsed);
    }

    const subjectId = await resolveSubject(a.auth, body.staffRecordId);
    const subject = subjectId
      ? await prisma.staffRecord.findFirst({
          where: { id: subjectId, companyId, isActive: true },
          select: { id: true, managerId: true },
        })
      : null;
    if (!subject)
      return withCors(ApiResponse.notFound("Staff record not found"), origin);

    // Cross-company validation of every referenced id
    if (body.competencyId) {
      const c = await prisma.competency.findFirst({
        where: { id: String(body.competencyId), companyId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!c) return bad("Competency not found or not active");
    }
    let mentorId: string | null = subject.managerId; // default: the employee's manager
    if (body.mentorId) {
      const m = await findEligibleCoach(
        companyId,
        String(body.mentorId),
        subject.id,
        subject.managerId,
      );
      if (!m)
        return bad(
          "Mentor must be an active manager, HR or admin in this company",
        );
      mentorId = m.id;
    }

    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.developmentPlan.create({
        data: {
          companyId,
          staffRecordId: subject.id,
          title,
          description: description || null,
          competencyId: body.competencyId ? String(body.competencyId) : null,
          careerAlignment: careerAlignment || null,
          mentorId,
          targetDate,
          createdById: actorId,
          milestones: {
            create: milestones.map((m, i) => ({
              title: m.title,
              dueDate: m.dueDate,
              displayOrder: i,
            })),
          },
        },
        include: PLAN_INCLUDE,
      });
      await logDevAction(tx, {
        planId: created.id,
        companyId,
        actorId,
        action: "CREATED",
        newData: { progress: 0, title, milestonesTotal: milestones.length },
      });
      return created;
    });

    return withCors(
      ApiResponse.success(
        serializePlan(plan),
        "Development plan created successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
