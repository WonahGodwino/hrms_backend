import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma"; // match your shared Prisma client import

export type RouteContext<T> = { params: Promise<T> | T };
type Db = Prisma.TransactionClient;

export const MAX_LONG_TEXT = 5000;
export const MAX_SHORT_TEXT = 255;
export const MAX_EVIDENCE_PER_REFLECTION = 10;
export const NO_ACTIVE_SELF_APPRAISAL_MESSAGE =
  "You have no self appraisal open right now. It will appear here once an appraisal cycle that includes you is active.";
export const SELF_APPRAISAL_OPEN_STATUSES = ["ACTIVE", "ESCALATED"] as const;

export const APPRAISAL_INCLUDE = {
  cycle: {
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      phases: {
        where: { phaseType: "SELF_APPRAISAL" as const },
        select: { enabled: true, deadline: true },
      },
    },
  },
  goalReflections: {
    orderBy: { displayOrder: "asc" as const },
    include: {
      evidence: {
        where: { removedAt: null },
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          goalReflectionId: true,
          sourceType: true,
          fileName: true,
          fileUrl: true,
          mimeType: true,
          sizeBytes: true,
          uploadedBy: true,
          createdAt: true,
          removedAt: true,
        },
      },
    },
  },
  competencyRatings: { orderBy: { displayOrder: "asc" as const } },
} satisfies Prisma.SelfAppraisalInclude;

export type AppraisalWithRelations = Prisma.SelfAppraisalGetPayload<{
  include: typeof APPRAISAL_INCLUDE;
}>;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------
export async function findOwnedAppraisal(
  id: string,
  companyId: string,
  staffRecordId: string,
) {
  return prisma.selfAppraisal.findFirst({
    where: { id, companyId, staffRecordId },
    include: APPRAISAL_INCLUDE,
  });
}

// Returns an error message if the appraisal can't be edited/submitted, else null.
export function assertEditable(a: AppraisalWithRelations): string | null {
  if (a.status !== "DRAFT")
    return "This appraisal has already been submitted and can no longer be edited";
  if (
    !(SELF_APPRAISAL_OPEN_STATUSES as readonly string[]).includes(
      a.cycle.status,
    )
  )
    return "The appraisal cycle is not active";
  const phase = a.cycle.phases[0];
  if (!phase || !phase.enabled)
    return "Self appraisal is not enabled for this cycle";
  return null;
}

// ---------------------------------------------------------------------------
// Derived values (never stored)
// ---------------------------------------------------------------------------
const filled = (s?: string | null) => !!s && s.trim().length > 0;

export function computeReadiness(a: AppraisalWithRelations) {
  const checklist = [
    {
      label: "Goal reflections documented",
      done: a.goalReflections.every((g) => filled(g.reflection)),
    },
    {
      label: "All competencies rated and commented",
      done: a.competencyRatings.every(
        (c) => c.rating !== null && filled(c.comment),
      ),
    },
    {
      label: "Challenges & learnings completed",
      done: filled(a.challenges) && filled(a.learnings),
    },
    {
      label: "Career growth section filled",
      done:
        filled(a.careerAspiration) ||
        filled(a.careerSkills) ||
        filled(a.careerSupport),
    },
  ];

  const sectionsComplete =
    checklist.filter((c) => c.done).length + (a.declarationAgreed ? 1 : 0);

  const rated = a.competencyRatings.filter((c) => c.rating !== null);
  const avgCompetency = rated.length
    ? Number(
        (
          rated.reduce((s, c) => s + (c.rating as number), 0) / rated.length
        ).toFixed(1),
      )
    : null;

  return {
    checklist,
    sectionsComplete,
    completion: Math.round((sectionsComplete / 5) * 100),
    avgCompetency,
    attachmentCount: a.goalReflections.reduce(
      (s, g) => s + g.evidence.length,
      0,
    ),
  };
}

// Shape deliberately mirrors SelfAppraisalFlow's local state.
export function serializeAppraisal(a: AppraisalWithRelations) {
  const phase = a.cycle.phases[0];
  return {
    id: a.id,
    status: a.status,
    editable: assertEditable(a) === null,
    cycle: {
      id: a.cycle.id,
      name: a.cycle.name,
      status: a.cycle.status,
      startDate: a.cycle.startDate,
      endDate: a.cycle.endDate,
      selfAppraisalDeadline: phase?.deadline ?? null,
    },
    goals: a.goalReflections.map((g) => ({
      goalId: g.goalId,
      reflectionId: g.id,
      title: g.goalTitle,
      progress: g.goalProgress,
      status: g.goalStatus,
      reflection: g.reflection ?? "",
      confidence: g.confidence,
      attachments: g.evidence.map((e) => ({
        id: e.id,
        sourceType: e.sourceType,
        fileName: e.fileName,
        fileUrl: e.fileUrl,
        mimeType: e.mimeType,
        sizeBytes: e.sizeBytes,
        downloadPath:
          e.sourceType === "UPLOAD"
            ? `/api/self-appraisals/evidence/${e.id}/file`
            : undefined,
      })),
    })),
    competencies: a.competencyRatings.map((c) => ({
      competencyId: c.competencyId,
      name: c.competencyName,
      desc: c.competencyDescription ?? "",
      rating: c.rating,
      comment: c.comment ?? "",
    })),
    challenges: { challenge: a.challenges ?? "", learning: a.learnings ?? "" },
    career: {
      aspiration: a.careerAspiration ?? "",
      skills: a.careerSkills ?? "",
      support: a.careerSupport ?? "",
    },
    declaration: a.declarationAgreed,
    submittedAt: a.submittedAt,
    lastSavedAt: a.updatedAt,
    readiness: computeReadiness(a),
  };
}

// ---------------------------------------------------------------------------
// Phase tracking (AppraisalParticipantPhase, SELF_APPRAISAL)
// ---------------------------------------------------------------------------
export async function markPhaseStarted(db: Db, participantId: string) {
  await db.appraisalParticipantPhase.updateMany({
    where: {
      participantId,
      phaseType: "SELF_APPRAISAL",
      status: "NOT_STARTED",
    },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Seeding: goals
// ---------------------------------------------------------------------------
export async function findEligibleGoals(
  db: Db,
  p: {
    companyId: string;
    staffRecordId: string | string[];
    cycleId: string;
    startDate: Date | null;
    endDate: Date | null;
  },
) {
  const or: Prisma.GoalWhereInput[] = [{ cycleId: p.cycleId }];
  if (p.startDate && p.endDate) {
    or.push({ cycleId: null, dueDate: { gte: p.startDate, lte: p.endDate } });
  }
  return db.goal.findMany({
    where: {
      companyId: p.companyId,
      staffRecordId: Array.isArray(p.staffRecordId)
        ? { in: p.staffRecordId }
        : p.staffRecordId,
      isArchived: false,
      OR: or,
    },
    select: {
      id: true,
      staffRecordId: true,
      title: true,
      progress: true,
      status: true,
      kpiImpact: true,
      performanceCategory: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

// While DRAFT: add newly-qualifying goals and refresh snapshots. Never removes
// a reflection (the employee may have written text on it). Returns true if
// anything changed.
export async function syncDraftGoals(
  db: Db,
  a: AppraisalWithRelations,
): Promise<boolean> {
  const goals = await findEligibleGoals(db, {
    companyId: a.companyId,
    staffRecordId: a.staffRecordId,
    cycleId: a.cycleId,
    startDate: a.cycle.startDate,
    endDate: a.cycle.endDate,
  });

  const existing = new Map(a.goalReflections.map((r) => [r.goalId, r]));
  let nextOrder =
    a.goalReflections.reduce((m, r) => Math.max(m, r.displayOrder), -1) + 1;
  let changed = false;

  for (const g of goals) {
    const row = existing.get(g.id);
    if (!row) {
      await db.selfAppraisalGoalReflection.create({
        data: {
          selfAppraisalId: a.id,
          goalId: g.id,
          goalTitle: g.title,
          goalProgress: g.progress,
          goalStatus: g.status,
          displayOrder: nextOrder++,
        },
      });
      changed = true;
    } else if (
      row.goalTitle !== g.title ||
      row.goalProgress !== g.progress ||
      row.goalStatus !== g.status
    ) {
      await db.selfAppraisalGoalReflection.update({
        where: { id: row.id },
        data: {
          goalTitle: g.title,
          goalProgress: g.progress,
          goalStatus: g.status,
        },
      });
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Seeding: competencies from the assigned self-assessment template
// ---------------------------------------------------------------------------
export async function resolveTemplateCompetencies(
  db: Db,
  p: {
    cycleId: string;
    departmentId: string | null;
    gradeLevelId?: string | null;
    seniorityBand?: string | null;
    audience?: "SELF" | "MANAGER";
  },
) {
  const assignments = await db.templateAssignment.findMany({
    where: {
      cycleId: p.cycleId,
      status: "ACTIVE",
      version: {
        audienceScopes: { some: { audienceType: p.audience ?? "SELF" } },
      },
    },
    orderBy: { assignedAt: "desc" },
    include: {
      departmentScopes: { select: { departmentId: true } },
      jobLevelScopes: { select: { seniorityBand: true } },
      version: {
        select: {
          id: true,
          sections: {
            orderBy: { displayOrder: "asc" },
            select: {
              questions: {
                where: {
                  questionType: "COMPETENCY_RATING",
                  competencyId: { not: null },
                },
                orderBy: { displayOrder: "asc" },
                select: {
                  competency: {
                    select: {
                      id: true,
                      name: true,
                      description: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // CUSTOM_GROUP is skipped: the schema has no member table for it yet.
  const targetBand = p.seniorityBand ?? p.gradeLevelId;
  const match = assignments.find((a) => {
    const deptOk =
      a.scopeType === "ALL_DEPARTMENTS" ||
      (a.scopeType === "SPECIFIC_DEPARTMENTS" &&
        !!p.departmentId &&
        a.departmentScopes.some((d) => d.departmentId === p.departmentId));
    const levelOk =
      a.jobLevelScopes.length === 0 ||
      (!!targetBand &&
        a.jobLevelScopes.some((j) => j.seniorityBand === targetBand));
    return deptOk && levelOk;
  });
  if (!match) return null;

  const seen = new Set<string>();
  const competencies: {
    id: string;
    name: string;
    description: string | null;
  }[] = [];
  for (const section of match.version.sections) {
    for (const q of section.questions) {
      const c = q.competency;
      if (!c || c.status === "ARCHIVED" || seen.has(c.id)) continue;
      seen.add(c.id);
      competencies.push({ id: c.id, name: c.name, description: c.description });
    }
  }
  return { versionId: match.version.id, competencies };
}

// ---------------------------------------------------------------------------
// Rating bounds: competency's scale override, else company default, else 1-5
// ---------------------------------------------------------------------------
export async function resolveRatingBounds(
  companyId: string,
  competencyIds: string[],
) {
  const bounds = new Map<string, { min: number; max: number }>();
  if (competencyIds.length === 0) return bounds;

  const range = (levels: { level: number }[]) =>
    levels.length
      ? {
          min: Math.min(...levels.map((l) => l.level)),
          max: Math.max(...levels.map((l) => l.level)),
        }
      : null;

  const [competencies, defaultScale] = await Promise.all([
    prisma.competency.findMany({
      where: { id: { in: competencyIds }, companyId },
      select: {
        id: true,
        scale: { select: { levels: { select: { level: true } } } },
      },
    }),
    prisma.proficiencyScale.findFirst({
      where: { companyId, isDefault: true, isActive: true },
      select: { levels: { select: { level: true } } },
    }),
  ]);

  const fallback = (defaultScale && range(defaultScale.levels)) || {
    min: 1,
    max: 5,
  };
  for (const c of competencies) {
    bounds.set(c.id, (c.scale && range(c.scale.levels)) || fallback);
  }
  return bounds;
}

// ---------------------------------------------------------------------------
// Draft payload parsing (shape mirrors the component state)
// ---------------------------------------------------------------------------
const TEXT_FIELDS = [
  {
    group: "challenges",
    key: "challenge",
    column: "challenges",
    max: MAX_LONG_TEXT,
  },
  {
    group: "challenges",
    key: "learning",
    column: "learnings",
    max: MAX_LONG_TEXT,
  },
  {
    group: "career",
    key: "aspiration",
    column: "careerAspiration",
    max: MAX_SHORT_TEXT,
  },
  {
    group: "career",
    key: "skills",
    column: "careerSkills",
    max: MAX_SHORT_TEXT,
  },
  {
    group: "career",
    key: "support",
    column: "careerSupport",
    max: MAX_LONG_TEXT,
  },
] as const;

export type GoalInput = {
  goalId: string;
  reflection?: string;
  confidence?: number;
};
export type CompetencyInput = {
  competencyId: string;
  rating?: number | null;
  comment?: string;
};

export function parseDraftPayload(body: any):
  | { error: string }
  | {
      data: Prisma.SelfAppraisalUpdateInput;
      goals: GoalInput[];
      competencies: CompetencyInput[];
      sections: string[];
    } {
  const data: Record<string, string | boolean> = {};
  const sections = new Set<string>();

  for (const f of TEXT_FIELDS) {
    const v = body?.[f.group]?.[f.key];
    if (v === undefined) continue;
    if (typeof v !== "string")
      return { error: `${f.group}.${f.key} must be a string` };
    if (v.length > f.max)
      return {
        error: `${f.group}.${f.key} must be at most ${f.max} characters`,
      };
    data[f.column] = v;
    sections.add(f.group);
  }

  if (body?.declaration !== undefined) {
    if (typeof body.declaration !== "boolean")
      return { error: "declaration must be a boolean" };
    data.declarationAgreed = body.declaration;
    sections.add("declaration");
  }

  const goals: GoalInput[] = body?.goals ?? [];
  if (!Array.isArray(goals)) return { error: "goals must be an array" };
  for (const g of goals) {
    if (!g || typeof g.goalId !== "string")
      return { error: "Each goal needs a goalId" };
    if (g.reflection !== undefined) {
      if (typeof g.reflection !== "string")
        return { error: "reflection must be a string" };
      if (g.reflection.length > MAX_LONG_TEXT)
        return {
          error: `reflection must be at most ${MAX_LONG_TEXT} characters`,
        };
    }
    if (
      g.confidence !== undefined &&
      (!Number.isInteger(g.confidence) || g.confidence < 1 || g.confidence > 5)
    )
      return { error: "confidence must be an integer from 1 to 5" };
  }
  if (goals.length) sections.add("goals");

  const competencies: CompetencyInput[] = body?.competencies ?? [];
  if (!Array.isArray(competencies))
    return { error: "competencies must be an array" };
  for (const c of competencies) {
    if (!c || typeof c.competencyId !== "string")
      return { error: "Each competency needs a competencyId" };
    if (
      c.rating !== undefined &&
      c.rating !== null &&
      !Number.isInteger(c.rating)
    )
      return { error: "rating must be an integer or null" };
    if (c.comment !== undefined) {
      if (typeof c.comment !== "string")
        return { error: "comment must be a string" };
      if (c.comment.length > MAX_LONG_TEXT)
        return { error: `comment must be at most ${MAX_LONG_TEXT} characters` };
    }
  }
  if (competencies.length) sections.add("competencies");

  return {
    data: data as Prisma.SelfAppraisalUpdateInput,
    goals,
    competencies,
    sections: [...sections],
  };
}
