import prisma from "@/app/lib/prisma";
import { nameOf, pipLabel } from "@/app/lib/pip";

const NAME = { select: { id: true, firstName: true, lastName: true } } as const;

// Open PIP escalations for the Ops monitor (company-wide, not cycle-bound)
export async function loadPipEscalationItems(companyId: string, limit = 50) {
  const where = {
    companyId,
    category: "PIP_ESCALATION" as const,
    status: { not: "RESOLVED" as const },
    pipId: { not: null },
  };
  const [total, rows] = await Promise.all([
    prisma.appraisalEscalation.count({ where }),
    prisma.appraisalEscalation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        category: true,
        severity: true,
        status: true,
        createdAt: true,
        reason: true,
        recommendedNextSteps: true,
        assignedReviewer: NAME,
        raiser: NAME,
        pip: {
          select: { id: true, number: true, staffRecord: NAME },
        },
      },
    }),
  ]);

  return {
    total,
    truncated: total > rows.length,
    items: rows.flatMap((e) =>
      !e.pip
        ? []
        : [
            {
              id: e.id,
              type: "ESCALATION" as const,
              category: e.category,
              severity: e.severity,
              status: e.status,
              createdAt: e.createdAt,
              assignedReviewer: e.assignedReviewer
                ? {
                    id: e.assignedReviewer.id,
                    name: nameOf(e.assignedReviewer),
                  }
                : null, // null until HR picks it up
              raisedBy: nameOf(e.raiser),
              pip: {
                id: e.pip.id,
                label: pipLabel(e.pip.number),
                employeeName: nameOf(e.pip.staffRecord) ?? "",
                reason: e.reason,
                recommendedNextSteps: e.recommendedNextSteps,
              },
            },
          ],
    ),
  };
}
