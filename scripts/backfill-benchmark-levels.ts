import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import prisma from "@/app/lib/prisma";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const COMPANY_ID = args.find((a) => a.startsWith("--company="))?.split("=")[1];

type LevelRow = { id: string; level: number; name: string };
type ScaleRow = {
  id: string;
  name: string;
  companyId: string;
  levels: LevelRow[];
};

type BenchmarkResult = {
  benchmarkId: string;
  legacyLevel: string;
  matchedLevelId?: string;
  matchedLevelName?: string;
  how?: "name" | "number";
  problem?: string;
};

type CompetencyResult = {
  competencyId: string;
  companyId: string;
  competencyName: string;
  competencyStatus: string;
  scale: string | null;
  outcome: "applied" | "would_apply" | "skipped";
  reason?: string;
  benchmarks: BenchmarkResult[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function matchLevel(
  label: string,
  levels: LevelRow[],
): { level?: LevelRow; how?: "name" | "number"; problem?: string } {
  const n = norm(label);

  const byName = levels.filter((l) => norm(l.name) === n);
  if (byName.length === 1) return { level: byName[0], how: "name" };
  if (byName.length > 1)
    return { problem: "multiple scale levels share this name" };

  const m = n.match(/^(?:level|lvl|l)?\s*(\d+)$/);
  if (m) {
    const num = Number(m[1]);
    const byValue = levels.find((l) => l.level === num);
    if (byValue) return { level: byValue, how: "number" };
    return { problem: `scale has no level with value ${num}` };
  }

  return { problem: "label doesn't match any level name or 'Level N' pattern" };
}

async function main() {
  console.log(
    `\nBenchmark level backfill — mode: ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}` +
      (COMPANY_ID ? `, company: ${COMPANY_ID}` : ", all companies"),
  );

  // Load active scales (+ levels) and index them
  const scales = (await prisma.proficiencyScale.findMany({
    where: { isActive: true, ...(COMPANY_ID && { companyId: COMPANY_ID }) },
    include: { levels: { select: { id: true, level: true, name: true } } },
  })) as (ScaleRow & { isDefault: boolean })[];

  const scaleById = new Map(scales.map((s) => [s.id, s]));
  const defaultByCompany = new Map(
    scales.filter((s) => s.isDefault).map((s) => [s.companyId, s]),
  );

  // Competencies that still have at least one unlinked legacy benchmark
  const competencies = await prisma.competency.findMany({
    where: {
      ...(COMPANY_ID && { companyId: COMPANY_ID }),
      benchmarks: { some: { levelId: null, level: { not: null } } },
    },
    include: { benchmarks: { orderBy: { displayOrder: "asc" } } },
    orderBy: [{ companyId: "asc" }, { name: "asc" }],
  });

  console.log(`Competencies with unlinked benchmarks: ${competencies.length}`);

  const results: CompetencyResult[] = [];

  for (const c of competencies) {
    const scale =
      (c.scaleId && scaleById.get(c.scaleId)) ||
      defaultByCompany.get(c.companyId) ||
      null;

    const base = {
      competencyId: c.id,
      companyId: c.companyId,
      competencyName: c.name,
      competencyStatus: c.status,
      scale: scale?.name ?? null,
    };

    if (!scale) {
      results.push({
        ...base,
        outcome: "skipped",
        reason: "No active default scale for this company — create one first",
        benchmarks: [],
      });
      continue;
    }

    const pending = c.benchmarks.filter((b) => !b.levelId && b.level);
    const alreadyUsed = new Set(
      c.benchmarks.filter((b) => b.levelId).map((b) => b.levelId!),
    );
    const claimed = new Set<string>(alreadyUsed);

    const rows: BenchmarkResult[] = [];
    let failed = false;

    for (const b of pending) {
      const { level, how, problem } = matchLevel(b.level!, scale.levels);
      if (!level) {
        rows.push({ benchmarkId: b.id, legacyLevel: b.level!, problem });
        failed = true;
        continue;
      }
      if (claimed.has(level.id)) {
        rows.push({
          benchmarkId: b.id,
          legacyLevel: b.level!,
          problem: `two benchmarks in this competency resolve to "${level.name}"`,
        });
        failed = true;
        continue;
      }
      claimed.add(level.id);
      rows.push({
        benchmarkId: b.id,
        legacyLevel: b.level!,
        matchedLevelId: level.id,
        matchedLevelName: level.name,
        how,
      });
    }

    if (failed) {
      results.push({
        ...base,
        outcome: "skipped",
        reason:
          "One or more benchmarks could not be matched unambiguously — review manually",
        benchmarks: rows,
      });
      continue;
    }

    if (APPLY) {
      await prisma.$transaction(
        rows.map((r) =>
          prisma.competencyBenchmark.update({
            where: { id: r.benchmarkId },
            data: { levelId: r.matchedLevelId!, level: r.matchedLevelName! },
          }),
        ),
      );
    }

    results.push({
      ...base,
      outcome: APPLY ? "applied" : "would_apply",
      benchmarks: rows,
    });
  }

  // ---- Report ----
  const applied = results.filter(
    (r) => r.outcome === "applied" || r.outcome === "would_apply",
  );
  const skipped = results.filter((r) => r.outcome === "skipped");
  const benchmarksLinked = applied.reduce((n, r) => n + r.benchmarks.length, 0);

  console.log(
    `\n${APPLY ? "Applied" : "Would apply"}: ${applied.length} competencies (${benchmarksLinked} benchmarks)`,
  );
  console.log(`Skipped (manual review): ${skipped.length} competencies`);

  if (skipped.length > 0) {
    console.log("\n--- Needs manual review ---");
    for (const r of skipped) {
      console.log(
        `\n• ${r.competencyName} [${r.competencyId}] (company ${r.companyId}, ${r.competencyStatus})`,
      );
      console.log(`  ${r.reason}`);
      for (const b of r.benchmarks.filter((x) => x.problem)) {
        console.log(`    - "${b.legacyLevel}": ${b.problem}`);
      }
    }
  }

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `benchmark-level-backfill-${APPLY ? "applied" : "dryrun"}-${Date.now()}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nFull report written to ${outFile}`);

  if (!APPLY)
    console.log(
      "\nDry run only. Re-run with --apply to write the matches above.",
    );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
