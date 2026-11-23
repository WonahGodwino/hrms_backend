import "dotenv/config";
import prisma from "@/app/lib/prisma";

async function backfill(
  rows: { participantId: string; submittedAt: Date | null }[],
  phaseType: "SELF_APPRAISAL" | "MANAGER_REVIEW",
) {
  let fixed = 0;
  for (const r of rows) {
    const when = r.submittedAt ?? new Date();
    // Same two-step logic as completeParticipantPhase, minus the transaction
    await prisma.appraisalParticipantPhase.updateMany({
      where: { participantId: r.participantId, phaseType, startedAt: null },
      data: { startedAt: when },
    });
    const res = await prisma.appraisalParticipantPhase.updateMany({
      where: {
        participantId: r.participantId,
        phaseType,
        status: { not: "COMPLETED" },
      },
      data: { status: "COMPLETED", completedAt: when },
    });
    fixed += res.count;
  }
  console.log(`${phaseType}: ${fixed} phase rows updated`);
}

async function main() {
  const selfDone = await prisma.selfAppraisal.findMany({
    where: { status: "SUBMITTED" },
    select: { participantId: true, submittedAt: true },
  });
  await backfill(selfDone, "SELF_APPRAISAL");

  const mgrDone = await prisma.managerReview.findMany({
    where: { status: "SUBMITTED" },
    select: { participantId: true, submittedAt: true },
  });
  await backfill(mgrDone, "MANAGER_REVIEW");
}

main().finally(() => prisma.$disconnect());
