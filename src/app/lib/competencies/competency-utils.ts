import { prisma } from "@/app/lib/db";
import { Prisma } from "@prisma/client";
import { CompetencyCategory, CompetencyStatus } from "@prisma/client";

export const VALID_CATEGORIES: CompetencyCategory[] = [
  "CORE",
  "LEADERSHIP",
  "TECHNICAL",
  "BEHAVIORAL",
  "COMPLIANCE",
  "OTHER",
];
export const VALID_STATUSES: CompetencyStatus[] = [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
];

const CATEGORY_DISPLAY_MAP: Record<CompetencyCategory, string> = {
  CORE: "Core",
  LEADERSHIP: "Leadership",
  TECHNICAL: "Technical",
  BEHAVIORAL: "Behavioral",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};

const STATUS_DISPLAY_MAP: Record<CompetencyStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export function toDisplayCategory(category: CompetencyCategory): string {
  return CATEGORY_DISPLAY_MAP[category] ?? category;
}

export function toDisplayStatus(status: CompetencyStatus): string {
  return STATUS_DISPLAY_MAP[status] ?? status;
}

interface LogCompetencyActionParams {
  competencyId: string;
  companyId: string; // NEW
  action: string;
  actorId: string;
  previousData?: any;
  newData?: any;
}
/**
 * Records a CompetencyHistory entry. Accepts either the default prisma client
 * or a transaction client (tx) so it can be called inside $transaction blocks.
 */
export async function logCompetencyAction(
  client: Prisma.TransactionClient,
  {
    competencyId,
    companyId,
    action,
    actorId,
    previousData,
    newData,
  }: LogCompetencyActionParams,
) {
  return client.competencyHistory.create({
    data: {
      competencyId,
      companyId,
      action,
      actorId,
      previousData: previousData ?? undefined,
      newData: newData ?? undefined,
    },
  });
}

export function formatActivityLabel(
  action: string,
  competencyName: string,
): string {
  const ACTION_LABEL_MAP: Record<string, string> = {
    CREATED: `${competencyName} created`,
    UPDATED: `${competencyName} updated`,
    ARCHIVED: `${competencyName} archived`,
    DUPLICATED: `${competencyName} duplicated`,
    ROLES_UPDATED: `${competencyName} role mappings updated`,
    DEPARTMENTS_UPDATED: `${competencyName} department mappings updated`,
    MATRIX_UPDATED: `${competencyName} mappings updated from the matrix`,
    DUPLICATE_DISMISSED: `${competencyName}: marked as not a duplicate`,
    DUPLICATE_RESTORED: `${competencyName}: duplicate flag restored`,
    REVIEW_SCHEDULED: `${competencyName}: review scheduled`,
    REVIEW_RESCHEDULED: `${competencyName}: review rescheduled`,
    REVIEW_CANCELLED: `${competencyName}: review cancelled`,
    REVIEW_COMPLETED: `${competencyName}: review completed`,
  };
  return ACTION_LABEL_MAP[action] ?? `${competencyName}: ${action}`;
}

type Db = Prisma.TransactionClient;

// Strict lookup: scale must belong to the company and be active
export async function findCompanyScale(
  client: Db,
  companyId: string,
  scaleId: string,
) {
  return client.proficiencyScale.findFirst({
    where: { id: scaleId, companyId, isActive: true },
    include: { levels: true },
  });
}

// Read-time resolution: competency's own scale, else the company default
export async function resolveScaleForCompetency(
  client: Db,
  competency: { companyId: string; scaleId: string | null },
) {
  if (competency.scaleId) {
    const own = await findCompanyScale(
      client,
      competency.companyId,
      competency.scaleId,
    );
    if (own) return own;
  }
  return client.proficiencyScale.findFirst({
    where: { companyId: competency.companyId, isDefault: true, isActive: true },
    include: { levels: true },
  });
}

type ScaleWithLevels = NonNullable<
  Awaited<ReturnType<typeof findCompanyScale>>
>;

// Validates benchmarks against the scale and builds Prisma-ready rows.
// Transition-friendly: a benchmark may still carry only a legacy `level` string.
export function buildBenchmarkData(
  benchmarks: any[],
  scale: ScaleWithLevels | null,
) {
  const levelsById = new Map((scale?.levels ?? []).map((l) => [l.id, l]));
  const used = new Set<string>();
  const data: {
    level: string | null;
    levelId: string | null;
    description: string | null;
    behaviors: string[];
    displayOrder: number;
  }[] = [];

  for (let i = 0; i < benchmarks.length; i++) {
    const b = benchmarks[i];
    let levelId: string | null = null;
    let level: string | null =
      typeof b.level === "string" && b.level.trim() ? b.level.trim() : null;

    if (b.levelId) {
      const match = levelsById.get(b.levelId);
      if (!match) {
        return {
          error: `Benchmark ${i + 1}: levelId is not part of the selected proficiency scale`,
        };
      }
      if (used.has(b.levelId)) {
        return { error: `Benchmark ${i + 1}: duplicate proficiency level` };
      }
      used.add(b.levelId);
      levelId = match.id;
      level = match.name; // keep legacy string in sync for older readers
    }

    if (!levelId && !level) {
      return { error: `Benchmark ${i + 1}: a level is required` };
    }

    data.push({
      level,
      levelId,
      description: b.description ?? b.desc ?? null,
      behaviors: Array.isArray(b.behaviors)
        ? b.behaviors.filter(
            (x: string) => typeof x === "string" && x.trim() !== "",
          )
        : [],
      displayOrder: i,
    });
  }
  return { data };
}

// Builds a short human-readable summary of what a history entry changed.
// Compares only meaningful fields (ignores ids/timestamps) so re-created
// benchmark rows don't show up as false changes.
export function describeHistoryChange(
  action: string,
  previousData: any,
  newData: any,
): string | null {
  if (action === "ROLES_UPDATED" || action === "DEPARTMENTS_UPDATED") {
    const n = Array.isArray(newData?.mappings) ? newData.mappings.length : null;
    const noun = action === "ROLES_UPDATED" ? "role" : "department";
    return n === null ? null : `${n} ${noun}${n === 1 ? "" : "s"} mapped`;
  }
  if (action === "MATRIX_UPDATED") {
    const n = Array.isArray(newData?.changes) ? newData.changes.length : null;
    return n === null
      ? null
      : `${n} mapping${n === 1 ? "" : "s"} changed via matrix`;
  }
  if (action === "DUPLICATE_DISMISSED" || action === "DUPLICATE_RESTORED") {
    return newData?.pairedWith ? `Compared with "${newData.pairedWith}"` : null;
  }
  if (action === "REVIEW_SCHEDULED" || action === "REVIEW_RESCHEDULED") {
    const due = newData?.scheduledFor
      ? new Date(newData.scheduledFor).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : null;
    const parts = [
      due && `Due ${due}`,
      newData?.assigneeName && `Assigned to ${newData.assigneeName}`,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (action === "REVIEW_COMPLETED") {
    const labels: Record<string, string> = {
      CONFIRMED: "Confirmed, no changes",
      UPDATED: "Reviewed and updated",
      RETIRED: "Reviewed and retired",
    };
    return labels[newData?.outcome] ?? null;
  }
  if (action !== "UPDATED" || !previousData || !newData) return null;

  const changed: string[] = [];
  const differs = (a: any, b: any) => (a ?? null) !== (b ?? null);

  if (differs(previousData.name, newData.name)) changed.push("Name");
  if (differs(previousData.description, newData.description))
    changed.push("Description");
  if (
    differs(previousData.category, newData.category) ||
    differs(previousData.customCategory, newData.customCategory)
  ) {
    changed.push("Category");
  }
  if (differs(previousData.tags, newData.tags)) changed.push("Tags");
  if (differs(previousData.scaleId, newData.scaleId))
    changed.push("Proficiency scale");
  if (differs(previousData.status, newData.status)) {
    changed.push(
      `Status (${toDisplayStatus(previousData.status)} → ${toDisplayStatus(newData.status)})`,
    );
  }

  const normBenchmarks = (bs: any[] | undefined) =>
    JSON.stringify(
      (bs ?? []).map((b) => [
        b.levelId ?? b.level ?? null,
        b.description ?? null,
        b.behaviors ?? [],
      ]),
    );
  if (
    normBenchmarks(previousData.benchmarks) !==
    normBenchmarks(newData.benchmarks)
  ) {
    changed.push("Benchmarks");
  }

  return changed.length > 0
    ? `Changed: ${changed.join(", ")}`
    : "No field changes";
}

export function normalizeLevelMappings(
  entries: any[],
  idKey: "designationId" | "departmentId",
  scale: { name: string; levels: { level: number }[] } | null,
):
  | { data: { id: string; requiredLevel: number | null }[] }
  | { error: string } {
  const allowed = scale ? new Set(scale.levels.map((l) => l.level)) : null;
  const seen = new Set<string>();
  const data: { id: string; requiredLevel: number | null }[] = [];

  for (const entry of entries) {
    const id = entry?.[idKey];
    if (typeof id !== "string" || id.trim() === "") {
      return { error: `Each mapping must include a valid ${idKey}` };
    }
    if (seen.has(id)) continue; // silently dedupe repeated ids
    seen.add(id);

    let requiredLevel: number | null = null;
    const raw = entry.requiredLevel;
    if (raw !== undefined && raw !== null && raw !== "") {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return {
          error: `Invalid requiredLevel for ${idKey} ${id}: must be a positive integer`,
        };
      }
      if (allowed && !allowed.has(parsed)) {
        return {
          error: `requiredLevel ${parsed} is not a level in the "${scale!.name}" scale (allowed: ${[...allowed].sort((a, b) => a - b).join(", ")})`,
        };
      }
      requiredLevel = parsed;
    }
    data.push({ id, requiredLevel });
  }
  return { data };
}

// Active (published) templates that rate this competency
export async function getActiveTemplateImpact(companyId: string, competencyId: string) {
  const rows = await prisma.templateQuestion.findMany({
    where: {
      competencyId,
      section: { version: { status: "ACTIVE", template: { companyId } } },
    },
    select: {
      section: { select: { version: { select: { template: { select: { id: true, name: true } } } } } },
    },
  });
  const byId = new Map<string, string>();
  for (const r of rows) {
    const t = r.section.version.template;
    byId.set(t.id, t.name);
  }
  const names = [...byId.values()];
  return { count: names.length, names: names.slice(0, 5) };
}

export const templateImpactMessage = (competencyName: string, count: number, names: string[]) =>
  `"${competencyName}" is rated in ${count} active template${count === 1 ? "" : "s"} (${names.join(", ")}${count > names.length ? ", ..." : ""}). Archiving it will flag ${count === 1 ? "that template" : "those templates"} under Compliance. Confirm to proceed.`;
