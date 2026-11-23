// scripts/archive-orphaned-versions.ts
import "dotenv/config";
import prisma from "@/app/lib/prisma";

async function main() {
  const archived = await prisma.reviewTemplate.findMany({
    where: { currentVersion: { status: "ARCHIVED" } },
    select: { id: true },
  });
  const res = await prisma.reviewTemplateVersion.updateMany({
    where: {
      templateId: { in: archived.map((t) => t.id) },
      status: { in: ["DRAFT", "ACTIVE"] },
    },
    data: { status: "ARCHIVED" },
  });
  console.log(
    `Archived ${res.count} lingering versions across ${archived.length} archived templates.`,
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
