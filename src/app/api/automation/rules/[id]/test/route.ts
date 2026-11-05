import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { Params, guarded, readBody, text } from "@/app/lib/pip-employee";
import {
  automationWriteCtx,
  evaluateDryRun,
  executorInfo,
  findRule,
  logAutomation,
} from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/automation/rules/{id}/test  { companyId, staffRecordId? }
// Dry run: reads the employee's data and evaluates the rule. It never performs the action and works on any status.
export async function POST(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);
    const staffRecordId = text(body.staffRecordId, "staffRecordId", 64);

    const rule = await findRule(prisma, ctx.companyId, id);
    const startedAt = new Date();
    const result = await evaluateDryRun(rule, ctx.companyId, staffRecordId);

    const run = await prisma.$transaction(async (tx) => {
      const r = await tx.automationRuleRun.create({
        data: {
          companyId: ctx.companyId,
          ruleId: id,
          mode: "TEST",
          status: result.outcome === "PASSED" ? "SUCCESS" : "SKIPPED",
          triggeredById: ctx.staffId,
          targetStaffRecordId: result.employee.id,
          conditionsMet: result.conditionsMet,
          result: JSON.parse(
            JSON.stringify({
              outcome: result.outcome,
              summary: result.summary,
              steps: result.steps,
              sample: result.sample,
            }),
          ) as Prisma.InputJsonValue,
          startedAt,
          finishedAt: new Date(),
        },
      });
      await logAutomation(tx, {
        companyId: ctx.companyId,
        entityType: "RULE",
        entityId: id,
        action: "TESTED",
        actorId: ctx.staffId,
        newData: {
          runId: r.id,
          outcome: result.outcome,
          targetStaffRecordId: result.employee.id,
        },
      });
      return r;
    });

    return ok(
      origin,
      {
        runId: run.id,
        outcome: result.outcome,
        employee: result.employee,
        steps: result.steps,
        summary: result.summary,
        executor: await executorInfo(ctx.companyId),
      },
      result.outcome === "PASSED"
        ? "Test passed"
        : "Test finished, the rule would not run",
    );
  });
}
