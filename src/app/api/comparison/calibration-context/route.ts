import { NextRequest } from "next/server";
import { CalibrationAdjustmentReason } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { CYCLE_SELECT } from "@/app/lib/manager-review";
import {
  RATING_LABELS,
  STATUS_LABELS,
  allowedActions,
  assertCalibrationOpen,
  buildRows,
  ensureCalibrationRecords,
  loadRecordRow,
  peerAverages,
  ratingFromScore,
  resolveCalibrator,
} from "@/app/lib/calibration";
import { fail, notFound, ok, readCtx } from "@/app/lib/pip";
import {
  MIN_GROUP,
  COMPARE_MAX,
  feedbackPositivity,
  getBasis,
  loadPopulation,
} from "@/app/lib/comparison";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const VARIANCE_GAP = 10; // decision 20

// GET /api/comparison/calibration-context?companyId&staffRecordId&cycleId?&compareIds?
// Data for CalibrationSessionModal. Saving goes through the existing PUT /api/calibration/records/:id
// so every calibration rule (reason, justification, status, history, finalized check) applies unchanged.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { companyId, user } = c.ctx;
    const { actor, isAdmin } = await resolveCalibrator(user, companyId);
    if (!actor.companyWide)
      return fail(origin, "Only HR or admin users can access calibration", 403);

    const staffRecordId = sp.get("staffRecordId") ?? "";
    const compareIds = [
      ...new Set(
        (sp.get("compareIds") ?? "")
          .split(",")
          .filter((x) => x && x !== staffRecordId),
      ),
    ].slice(0, COMPARE_MAX - 1);
    const basis = await getBasis(companyId, actor, sp.get("cycleId"));
    if ("error" in basis) return fail(origin, basis.error, basis.status);
    const cycle = basis.cycle;
    if (!cycle)
      return fail(origin, "No completed appraisal results are available", 409);

    const pop = await loadPopulation(companyId, actor, cycle, [
      staffRecordId,
      ...compareIds,
    ]);
    const me = pop.find((m) => m.staffRecordId === staffRecordId);
    if (!me) return notFound(origin, "Employee");

    let rec = await prisma.calibrationRecord.findFirst({
      where: { companyId, cycleId: cycle.id, staffRecordId },
      select: { id: true },
    });
    if (!rec) {
      await ensureCalibrationRecords(companyId, cycle.id); // idempotent backfill
      rec = await prisma.calibrationRecord.findFirst({
        where: { companyId, cycleId: cycle.id, staffRecordId },
        select: { id: true },
      });
    }
    if (!rec) return notFound(origin, "Calibration record");
    const record = await loadRecordRow(rec.id, companyId);
    if (!record) return notFound(origin, "Calibration record");

    const cycleInfo = await prisma.appraisalCycle.findUnique({
      where: { id: cycle.id },
      select: CYCLE_SELECT,
    });
    const blockedCycle = cycleInfo
      ? assertCalibrationOpen(cycleInfo)
      : "Cycle not found";
    const [row] = await buildRows([record], {
      companyId,
      isAdmin,
      cycleOpen: !blockedCycle,
    });
    const canAdjust =
      !blockedCycle &&
      allowedActions(record.status, isAdmin).includes("ADJUST");
    const blockedReason =
      blockedCycle ??
      (canAdjust
        ? null
        : record.status === "FINALIZED"
          ? "Finalized records can't be changed"
          : "Only ADMIN or SUPER_ADMIN can modify an escalated record");
    const [averages, fb] = await Promise.all([
      peerAverages(companyId, record),
      feedbackPositivity(companyId, [me], cycle),
    ]);

    // Variance alert: manager score against the other selected people, else against the self score
    const others = pop.filter(
      (m) => m.staffRecordId !== staffRecordId && m.originalScore !== null,
    );
    const baseline = others.length
      ? others.reduce((s, m) => s + (m.originalScore as number), 0) /
        others.length
      : me.selfPct;
    const gap =
      me.originalScore !== null && baseline !== null
        ? me.originalScore - baseline
        : null;

    const scoreBands: {
      code: string;
      label: string;
      from: number;
      to: number;
    }[] = [];
    for (let s = 0; s <= 100; s++) {
      const code = ratingFromScore(s);
      const last = scoreBands[scoreBands.length - 1];
      if (last && last.code === code) last.to = s;
      else
        scoreBands.push({ code, label: RATING_LABELS[code], from: s, to: s });
    }
    return ok(origin, {
      cycle: { id: cycle.id, name: cycle.name },
      record: {
        id: record.id,
        status: record.status,
        statusLabel: STATUS_LABELS[record.status],
        originalRating: record.originalRating,
        proposedRating: record.proposedRating,
        proposedLabel: RATING_LABELS[record.proposedRating],
        adjustmentReason: record.adjustmentReason,
        justification: record.justification,
      },
      employee: {
        id: me.staffRecordId,
        name: me.name,
        avatarUrl: me.avatarUrl,
      },
      ratings: {
        self: me.selfPct === null ? null : Math.round(me.selfPct),
        manager:
          me.originalScore === null ? null : Math.round(me.originalScore),
        peer: fb.get(staffRecordId) ?? null,
        peerLabel: "Feedback positivity",
      },
      effectiveScore: Math.round(me.score),
      deptAverage: averages.deptAverage,
      managerAverage: averages.managerAverage,
      variance:
        gap !== null && Math.abs(gap) >= VARIANCE_GAP
          ? {
              gap: Math.round(gap),
              managerScore: Math.round(me.originalScore as number),
              baseline: Math.round(baseline as number),
              baselineLabel: others.length
                ? "comparison average"
                : "self appraisal",
            }
          : null,
      scoreBands,
      adjustmentReasons: Object.values(CalibrationAdjustmentReason),
      canAdjust,
      blockedReason,
      minGroup: MIN_GROUP,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
