import { prisma } from "@/app/lib/db";
import { toDisplayCategory } from "./competency-utils";

export const DEFAULT_THRESHOLD = 70;
const MIN_THRESHOLD = 50;
const MAX_THRESHOLD = 95;
const MAX_COMPETENCIES = 1500; // pairwise scan is O(n²); guard against runaway cost
const MAX_PAIRS = 100;

// Scoring weights (tune here)
const NAME_WEIGHT = 0.4;
const BEHAVIOR_WEIGHT = 0.6;
const CROSS_CATEGORY_FACTOR = 0.85; // pairs in different categories count for less
const MISSING_TEXT_FACTOR = 0.85; // no behavior text on one side: less evidence, name only

export class SimilarityError extends Error {
  status = 422;
}

const STOPWORDS = new Set(
  (
    "a an and are as at be been by for from has have in into is it its of on or that the their them they this to with will can able " +
    "ability skill skills competency competencies demonstrates demonstrate shows show consistently effectively level levels"
  ).split(" "),
);

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

const stem = (w: string) =>
  w.length <= 4 ? w : w.replace(/(ing|ed|es|ly|s)$/, "");

const bigrams = (s: string) => {
  const flat = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < flat.length - 1; i++) out.add(flat.slice(i, i + 2));
  return out;
};

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

const dice = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
};

export const clampThreshold = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(n)));
};

// Stable ordering so a pair always has the same key (used for dismissals)
export const orderPair = (x: string, y: string): [string, string] =>
  x < y ? [x, y] : [y, x];

type Prepared = {
  id: string;
  name: string;
  category: string;
  customCategory: string | null;
  status: string;
  nameTokens: Set<string>;
  nameBigrams: Set<string>;
  vec: Map<string, number> | null;
  norm: number;
  benchmarks: {
    level: string | null;
    description: string | null;
    behaviors: string[];
  }[];
};

async function loadPrepared(companyId: string) {
  const rows = await prisma.competency.findMany({
    where: { companyId, status: { in: ["ACTIVE", "DRAFT"] } },
    select: {
      id: true,
      name: true,
      category: true,
      customCategory: true,
      status: true,
      benchmarks: {
        orderBy: { displayOrder: "asc" },
        select: {
          level: true,
          description: true,
          behaviors: true,
          level_rel: { select: { name: true } },
        },
      },
    },
  });

  if (rows.length > MAX_COMPETENCIES) {
    throw new SimilarityError(
      `Duplicate scan supports up to ${MAX_COMPETENCIES} competencies (found ${rows.length}).`,
    );
  }
  rows.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)); // JS ordering, matches orderPair

  const display = new Map<string, string>(); // stem -> readable word
  const tfs = rows.map((r) => {
    const text = r.benchmarks
      .flatMap((b) => [b.description ?? "", ...b.behaviors])
      .join(" ");
    const tf = new Map<string, number>();
    for (const raw of tokenize(text)) {
      const s = stem(raw);
      if (!display.has(s)) display.set(s, raw);
      tf.set(s, (tf.get(s) ?? 0) + 1);
    }
    return tf;
  });

  const df = new Map<string, number>();
  for (const tf of tfs)
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const N = rows.length;

  const prepared: Prepared[] = rows.map((r, i) => {
    const tf = tfs[i];
    let vec: Map<string, number> | null = null;
    let norm = 0;
    if (tf.size > 0) {
      vec = new Map();
      for (const [term, f] of tf) {
        const w =
          (1 + Math.log(f)) *
          (Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1);
        vec.set(term, w);
        norm += w * w;
      }
      norm = Math.sqrt(norm);
    }
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      customCategory: r.customCategory,
      status: r.status,
      nameTokens: new Set(tokenize(r.name).map(stem)),
      nameBigrams: bigrams(r.name),
      vec,
      norm,
      benchmarks: r.benchmarks.map((b) => ({
        level: b.level_rel?.name ?? b.level,
        description: b.description,
        behaviors: b.behaviors,
      })),
    };
  });

  return { prepared, display };
}

const cosine = (a: Prepared, b: Prepared): number | null => {
  if (!a.vec || !b.vec || a.norm === 0 || b.norm === 0) return null;
  const [small, large] =
    a.vec.size <= b.vec.size ? [a.vec, b.vec] : [b.vec, a.vec];
  let dot = 0;
  for (const [term, w] of small) {
    const o = large.get(term);
    if (o !== undefined) dot += w * o;
  }
  return dot / (a.norm * b.norm);
};

const sharedTerms = (
  a: Prepared,
  b: Prepared,
  display: Map<string, string>,
) => {
  if (!a.vec || !b.vec) return [];
  const shared: [string, number][] = [];
  for (const [term, w] of a.vec) {
    const o = b.vec.get(term);
    if (o !== undefined) shared.push([term, Math.min(w, o)]);
  }
  return shared
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([term]) => display.get(term) ?? term);
};

async function scorePairs(companyId: string, threshold: number) {
  const { prepared, display } = await loadPrepared(companyId);

  const dismissedRows = await prisma.competencyDuplicateDismissal.findMany({
    where: { companyId },
    select: { competencyAId: true, competencyBId: true },
  });
  const dismissed = new Set(
    dismissedRows.map((d) => `${d.competencyAId}|${d.competencyBId}`),
  );

  const pairs: {
    a: Prepared;
    b: Prepared;
    percent: number;
    nameScore: number;
    behaviorScore: number | null;
    sameCategory: boolean;
    dismissed: boolean;
  }[] = [];

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];

      const nameScore = Math.max(
        jaccard(a.nameTokens, b.nameTokens),
        dice(a.nameBigrams, b.nameBigrams),
      );
      const behaviorScore = cosine(a, b);

      const base =
        behaviorScore !== null
          ? NAME_WEIGHT * nameScore + BEHAVIOR_WEIGHT * behaviorScore
          : nameScore * MISSING_TEXT_FACTOR;

      const sameCategory =
        a.category === b.category &&
        (a.category !== "OTHER" ||
          (a.customCategory ?? "").toLowerCase() ===
            (b.customCategory ?? "").toLowerCase());

      const percent = Math.round(
        base * (sameCategory ? 1 : CROSS_CATEGORY_FACTOR) * 100,
      );
      if (percent < threshold) continue;

      pairs.push({
        a,
        b,
        percent,
        nameScore,
        behaviorScore,
        sameCategory,
        dismissed: dismissed.has(`${a.id}|${b.id}`),
      });
    }
  }

  pairs.sort((x, y) => y.percent - x.percent);
  return { display, pairs };
}

// ---- Full report for the Duplicates tab ----
export async function getDuplicateReport(
  companyId: string,
  threshold: unknown,
  includeDismissed: boolean,
) {
  const t = clampThreshold(threshold);
  const { display, pairs } = await scorePairs(companyId, t);

  const visible = includeDismissed ? pairs : pairs.filter((p) => !p.dismissed);
  const dismissedCount = pairs.filter((p) => p.dismissed).length;
  const top = visible.slice(0, MAX_PAIRS);

  // Details only for competencies that actually appear in the returned pairs
  const involved = new Map<string, Prepared>();
  for (const p of top) {
    involved.set(p.a.id, p.a);
    involved.set(p.b.id, p.b);
  }
  const ids = [...involved.keys()];

  const [counts, usageRows] = await Promise.all([
    prisma.competency.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        _count: { select: { roleMappings: true, departmentMappings: true } },
      },
    }),
    prisma.templateQuestion.findMany({
      where: {
        competencyId: { in: ids },
        section: { version: { status: "ACTIVE", template: { companyId } } },
      },
      select: {
        competencyId: true,
        section: { select: { version: { select: { templateId: true } } } },
      },
    }),
  ]);

  const countById = new Map(counts.map((c) => [c.id, c._count]));
  const templatesById = new Map<string, Set<string>>();
  for (const row of usageRows) {
    if (!row.competencyId) continue;
    if (!templatesById.has(row.competencyId))
      templatesById.set(row.competencyId, new Set());
    templatesById.get(row.competencyId)!.add(row.section.version.templateId);
  }

  const competencies: Record<string, unknown> = {};
  for (const [id, c] of involved) {
    competencies[id] = {
      id,
      name: c.name,
      category: toDisplayCategory(c.category as any),
      customCategory: c.customCategory,
      status: c.status,
      benchmarks: c.benchmarks,
      roles: countById.get(id)?.roleMappings ?? 0,
      departments: countById.get(id)?.departmentMappings ?? 0,
      templateUsage: templatesById.get(id)?.size ?? 0,
    };
  }

  return {
    threshold: t,
    totalPairs: visible.length,
    dismissedCount,
    capped: visible.length > MAX_PAIRS,
    competencies,
    pairs: top.map((p) => ({
      aId: p.a.id,
      bId: p.b.id,
      score: p.percent,
      nameScore: Math.round(p.nameScore * 100),
      behaviorScore:
        p.behaviorScore === null ? null : Math.round(p.behaviorScore * 100),
      sameCategory: p.sameCategory,
      sharedTerms: sharedTerms(p.a, p.b, display),
      dismissed: p.dismissed,
    })),
  };
}

// ---- Light summary for the panel alert (default threshold, dismissed pairs excluded) ----
export async function getDuplicateSummary(companyId: string) {
  const { pairs } = await scorePairs(companyId, DEFAULT_THRESHOLD);
  const active = pairs.filter((p) => !p.dismissed);
  const top = active[0];
  return {
    threshold: DEFAULT_THRESHOLD,
    count: active.length,
    topPair: top
      ? { aName: top.a.name, bName: top.b.name, score: top.percent }
      : null,
  };
}
