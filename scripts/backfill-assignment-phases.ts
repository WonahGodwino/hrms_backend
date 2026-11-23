import "dotenv/config";
import { ReviewPhaseType, TemplateType } from "@prisma/client";
import prisma from "@/app/lib/prisma";

// Keep in sync with TEMPLATE_TYPE_PHASES in cycle-assignments.ts
const MAP: Record<TemplateType, ReviewPhaseType[]> = {
  SELF_ASSESSMENT: ["SELF_APPRAISAL"],
  PERFORMANCE_REVIEW: ["SELF_APPRAISAL", "MANAGER_REVIEW"],
  MANAGER_CHECKIN: ["MANAGER_REVIEW"],
  FEEDBACK_360: ["PEER_REVIEW"],
  OTHER: ["SELF_APPRAISAL", "MANAGER_REVIEW", "PEER_REVIEW"],
};

async function main() {
  const rows = await prisma.templateAssignment.findMany({
    where: { phaseType: null, status: "ACTIVE" },
    include: {
      template: { select: { name: true, type: true } },
      cycle: {
        select: {
          name: true,
          phases: { where: { enabled: true }, select: { phaseType: true } },
        },
      },
    },
  });

  let updated = 0;
  const unresolved: string[] = [];
  for (const r of rows) {
    const enabled = new Set(r.cycle.phases.map((p) => p.phaseType));
    const candidates = (MAP[r.template.type] ?? []).filter((p) =>
      enabled.has(p),
    );
    if (candidates.length === 0) {
      unresolved.push(
        `${r.template.name} -> ${r.cycle.name}: no compatible enabled phase`,
      );
      continue;
    }
    const phaseType = candidates.includes("MANAGER_REVIEW")
      ? "MANAGER_REVIEW"
      : candidates[0];
    await prisma.templateAssignment.update({
      where: { id: r.id },
      data: { phaseType },
    });
    updated++;
  }
  console.log(`Backfilled ${updated} of ${rows.length} assignments.`);
  if (unresolved.length)
    console.log("Needs manual attention:\n" + unresolved.join("\n"));
}

main().finally(() => prisma.$disconnect());
