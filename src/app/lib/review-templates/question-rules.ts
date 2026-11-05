import { QuestionType } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { VALID_QUESTION_TYPES } from "./review-template-utils";
import { resolveScaleForCompetency } from "@/app/lib/competencies/competency-utils";

export const GOAL_SCOPES = ["CYCLE", "ALL_ACTIVE"] as const;

export interface NormalizedQuestion {
  prompt: string;
  questionType: QuestionType;
  required: boolean;
  competencyId: string | null;
  proficiencyScaleId: string | null;
  config: Record<string, any> | null;
  options: { label: string; value: string }[];
  helpText: string | null;
  bankItemId: string | null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "option";

// Shape validation only (no database). Used by the version PATCH and the question bank.
export function normalizeQuestion(raw: any): {
  value?: NormalizedQuestion;
  error?: string;
} {
  const prompt = typeof raw?.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) return { error: "Every question needs a prompt" };
  if (prompt.length > 1000)
    return { error: "A question prompt cannot exceed 1000 characters" };

  const type = String(raw?.questionType ?? "").toUpperCase() as QuestionType;
  if (!VALID_QUESTION_TYPES.includes(type)) {
    return {
      error: `Invalid questionType: ${raw?.questionType}. Must be one of: ${VALID_QUESTION_TYPES.join(", ")}`,
    };
  }

  let competencyId: string | null = null;
  let proficiencyScaleId: string | null = null;
  let config: Record<string, any> | null = null;
  const options: { label: string; value: string }[] = [];
  const c = raw?.config && typeof raw.config === "object" ? raw.config : {};
  const helpText =
    typeof raw?.helpText === "string" && raw.helpText.trim()
      ? raw.helpText.trim().slice(0, 300)
      : null;

  switch (type) {
    case "COMPETENCY_RATING": {
      if (typeof raw.competencyId !== "string" || !raw.competencyId) {
        return { error: `"${prompt}": choose a competency to rate` };
      }
      competencyId = raw.competencyId; // the scale is attached later from the competency
      break;
    }

    case "RATING_SCALE":
    case "GOAL_ASSESSMENT": {
      proficiencyScaleId =
        typeof raw.proficiencyScaleId === "string" && raw.proficiencyScaleId
          ? raw.proficiencyScaleId
          : null;
      const rating: Record<string, any> = {};
      if (!proficiencyScaleId) {
        const max = Number(c.max ?? 5);
        if (!Number.isInteger(max) || max < 3 || max > 10) {
          return {
            error: `"${prompt}": a numeric rating scale needs between 3 and 10 points`,
          };
        }
        rating.max = max;
        const low =
          typeof c.lowLabel === "string" ? c.lowLabel.trim().slice(0, 40) : "";
        const high =
          typeof c.highLabel === "string"
            ? c.highLabel.trim().slice(0, 40)
            : "";
        if (low) rating.lowLabel = low;
        if (high) rating.highLabel = high;
      }
      config = Object.keys(rating).length ? rating : null;

      if (type === "GOAL_ASSESSMENT") {
        const scope = String(c.goalScope ?? "ALL_ACTIVE").toUpperCase();
        if (!(GOAL_SCOPES as readonly string[]).includes(scope)) {
          return {
            error: `"${prompt}": goalScope must be one of ${GOAL_SCOPES.join(", ")}`,
          };
        }
        config = {
          ...(config ?? {}),
          goalScope: scope,
          showProgress: c.showProgress !== false,
          requireComment: c.requireComment === true,
        };
      }
      break;
    }

    case "MULTIPLE_CHOICE": {
      const rawOptions = Array.isArray(raw.options) ? raw.options : [];
      const seenLabels = new Set<string>();
      const seenValues = new Set<string>();
      for (const o of rawOptions) {
        const label = typeof o?.label === "string" ? o.label.trim() : "";
        if (!label)
          return { error: `"${prompt}": option labels cannot be empty` };
        if (seenLabels.has(label.toLowerCase()))
          return { error: `"${prompt}": duplicate option "${label}"` };
        seenLabels.add(label.toLowerCase());
        const base =
          typeof o?.value === "string" && o.value.trim()
            ? o.value.trim()
            : slug(label);
        let value = base;
        let n = 2;
        while (seenValues.has(value)) value = `${base}_${n++}`;
        seenValues.add(value);
        options.push({ label, value });
      }
      if (options.length < 2)
        return {
          error: `"${prompt}": multiple choice questions need at least 2 options`,
        };
      if (options.length > 12)
        return {
          error: `"${prompt}": multiple choice questions can have at most 12 options`,
        };
      config = { allowMultiple: c.allowMultiple === true };
      break;
    }

    case "TEXT":
      break;
  }

  return {
    value: {
      prompt,
      helpText,
      questionType: type,
      required: raw?.required ?? true,
      competencyId,
      proficiencyScaleId,
      config,
      options,
      bankItemId:
        typeof raw?.bankItemId === "string" && raw.bankItemId
          ? raw.bankItemId
          : null,
    },
  };
}

// Database checks for a single question (used by the question bank).
// A competency question always takes the competency's own scale.
export async function resolveQuestionLinks(
  companyId: string,
  q: NormalizedQuestion,
  opts: { allowInactiveCompetencyId?: string } = {},
): Promise<{ proficiencyScaleId: string | null } | { error: string }> {
  if (q.questionType === "COMPETENCY_RATING") {
    const competency = await prisma.competency.findFirst({
      where: { id: q.competencyId! },
      select: {
        id: true,
        name: true,
        companyId: true,
        scaleId: true,
        status: true,
      },
    });
    if (!competency || competency.companyId !== companyId) {
      return { error: "Competency does not belong to this company" };
    }
    if (
      competency.status !== "ACTIVE" &&
      competency.id !== opts.allowInactiveCompetencyId
    ) {
      return { error: `"${competency.name}" is not an active competency` };
    }
    const scale = await resolveScaleForCompetency(prisma, {
      companyId,
      scaleId: competency.scaleId,
    });
    return { proficiencyScaleId: scale?.id ?? null };
  }
  if (q.proficiencyScaleId) {
    const scale = await prisma.proficiencyScale.findFirst({
      where: { id: q.proficiencyScaleId, companyId, isActive: true },
      select: { id: true },
    });
    if (!scale)
      return { error: "The proficiency scale does not exist or is not active" };
  }
  return { proficiencyScaleId: q.proficiencyScaleId };
}
