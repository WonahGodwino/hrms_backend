// scripts/backfill-designation-department.ts
import "dotenv/config";
import prisma from "@/app/lib/prisma"; // adjust this path to match your actual file location

const DRY_RUN = process.argv.includes("--dry-run");

interface BackfillResult {
  designationId: string;
  designationTitle: string;
  companyId: string | null;
  inferredDepartmentId: string | null;
  inferredDepartmentName: string | null;
  staffCount: number;
  confidence: string;
}

async function main() {
  console.log(
    DRY_RUN
      ? "🔍 DRY RUN — no changes will be made\n"
      : "⚠️  LIVE RUN — changes will be applied\n",
  );

  const designations = await prisma.designation.findMany({
    where: { departmentId: null },
    select: { id: true, title: true, companyId: true },
  });

  console.log(
    `Found ${designations.length} designation(s) with no departmentId.\n`,
  );

  const results: BackfillResult[] = [];

  for (const designation of designations) {
    const staffWithDesignation = await prisma.staffRecord.findMany({
      where: { designationId: designation.id, departmentId: { not: null } },
      select: { departmentId: true },
    });

    if (staffWithDesignation.length === 0) {
      results.push({
        designationId: designation.id,
        designationTitle: designation.title,
        companyId: designation.companyId,
        inferredDepartmentId: null,
        inferredDepartmentName: null,
        staffCount: 0,
        confidence:
          "NO DATA — no staff hold this designation with a known department",
      });
      continue;
    }

    const counts = staffWithDesignation.reduce(
      (acc: Record<string, number>, s) => {
        const id = s.departmentId as string;
        acc[id] = (acc[id] || 0) + 1;
        return acc;
      },
      {},
    );

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [topDepartmentId, topCount] = sorted[0];
    const totalStaff = staffWithDesignation.length;
    const isUnanimous = sorted.length === 1;

    const department = await prisma.department.findUnique({
      where: { id: topDepartmentId },
      select: { name: true },
    });

    results.push({
      designationId: designation.id,
      designationTitle: designation.title,
      companyId: designation.companyId,
      inferredDepartmentId: topDepartmentId,
      inferredDepartmentName: department?.name || "UNKNOWN",
      staffCount: totalStaff,
      confidence: isUnanimous
        ? `HIGH — all ${totalStaff} staff in this department`
        : `MIXED — ${topCount}/${totalStaff} staff in this department (conflicting data)`,
    });
  }

  console.log("─".repeat(100));
  for (const r of results) {
    console.log(`Designation: "${r.designationTitle}" (${r.designationId})`);
    console.log(
      `  → Inferred department: ${r.inferredDepartmentName || "NONE"} ${r.inferredDepartmentId ? `(${r.inferredDepartmentId})` : ""}`,
    );
    console.log(`  → Confidence: ${r.confidence}`);
    console.log("─".repeat(100));
  }

  const applicable = results.filter((r) => r.inferredDepartmentId !== null);
  const unresolvable = results.filter((r) => r.inferredDepartmentId === null);

  console.log(`\n${applicable.length} designation(s) can be backfilled.`);
  console.log(
    `${unresolvable.length} designation(s) have NO staff data to infer from — these need manual assignment:\n`,
  );
  unresolvable.forEach((r) =>
    console.log(`  - "${r.designationTitle}" (${r.designationId})`),
  );

  if (DRY_RUN) {
    console.log(
      "\nDry run complete. Re-run without --dry-run to apply the HIGH-confidence updates.",
    );
    return;
  }

  const highConfidence = applicable.filter((r) =>
    r.confidence.startsWith("HIGH"),
  );
  const mixedConfidence = applicable.filter((r) =>
    r.confidence.startsWith("MIXED"),
  );

  console.log(
    `\nApplying ${highConfidence.length} HIGH-confidence update(s)...`,
  );

  for (const r of highConfidence) {
    await prisma.designation.update({
      where: { id: r.designationId },
      data: { departmentId: r.inferredDepartmentId },
    });
    console.log(
      `  ✓ Updated "${r.designationTitle}" → ${r.inferredDepartmentName}`,
    );
  }

  if (mixedConfidence.length > 0) {
    console.log(
      `\n⚠️  ${mixedConfidence.length} MIXED-confidence designation(s) were NOT auto-applied — review manually:`,
    );
    mixedConfidence.forEach((r) =>
      console.log(
        `  - "${r.designationTitle}": majority points to ${r.inferredDepartmentName}, but staff are split`,
      ),
    );
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
