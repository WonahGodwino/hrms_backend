import "dotenv/config";
import prisma from "@/app/lib/prisma";

async function main() {
  const goals = await prisma.goal.findMany({
    where: { progress: 100, status: "NEARING_COMPLETION" },
    select: { id: true, updatedAt: true },
  });
  for (const g of goals) {
    const last = await prisma.goalProgressUpdate.findFirst({
      where: { goalId: g.id, progress: 100 },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    await prisma.goal.update({
      where: { id: g.id },
      data: {
        status: "COMPLETED",
        completedAt: last?.createdAt ?? g.updatedAt,
      },
    });
  }
  console.log(`Backfilled ${goals.length} goals`);
}
main().finally(() => prisma.$disconnect());
