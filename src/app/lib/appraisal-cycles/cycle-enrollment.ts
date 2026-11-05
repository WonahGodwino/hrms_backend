import {
  Prisma,
  AppraisalCycleStatus,
  AppraisalCycleScopeType,
  ReviewPhaseType,
} from "@prisma/client";
import {
  eligibleStaffWhere,
  loadExcludedStaffIds,
} from "./appraisal-cycle-utils";
import {
  TEMPLATE_PHASES,
  ResolvableAssignment,
  toResolvable,
  resolveAssignment,
} from "./cycle-assignments";
import { generatePeerPairs, PeerParticipant } from "./peer-matrix";

export class EnrollmentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const RUNNING_STATUSES: AppraisalCycleStatus[] = [
  "ACTIVE",
  "PAUSED",
  "ESCALATED",
];
export const PARTICIPANT_EDITABLE: AppraisalCycleStatus[] = [
  "DRAFT",
  "SCHEDULED",
  ...RUNNING_STATUSES,
];

export interface EnrollableCycle {
  id: string;
  companyId: string;
  scopeType: AppraisalCycleScopeType;
  startDate: Date | null;
  minTenureMonths: number;
  departmentScopes: { departmentId: string }[];
  phases: { phaseType: ReviewPhaseType; enabled: boolean }[];
}

const enrollmentWhere = (cycle: EnrollableCycle, excludedStaffIds: string[]) =>
  eligibleStaffWhere({
    companyId: cycle.companyId,
    scopeType: cycle.scopeType,
    departmentIds: cycle.departmentScopes.map((d) => d.departmentId),
    minTenureMonths: cycle.minTenureMonths,
    startDate: cycle.startDate,
    excludedStaffIds,
  });
export { enrollmentWhere };

export const isStarted = (p: {
  phases: { status: string }[];
  selfAppraisal?: unknown;
  managerReview?: unknown;
}) =>
  p.phases.some((ph) => ph.status !== "NOT_STARTED") ||
  !!p.selfAppraisal ||
  !!p.managerReview;

// Compare-and-set on status: re-validates the cycle and locks its row until the transaction commits.
export async function lockCycleStatuses(
  tx: Prisma.TransactionClient,
  cycleId: string,
  companyId: string,
  actorId: string,
  statuses: AppraisalCycleStatus[],
) {
  const res = await tx.appraisalCycle.updateMany({
    where: { id: cycleId, companyId, status: { in: statuses } },
    data: { updatedBy: actorId },
  });
  if (res.count === 0) {
    throw new EnrollmentError(
      409,
      "This cycle's status just changed. Refresh and try again.",
    );
  }
}

/**
 * Enrols every eligible employee who isn't a participant yet: snapshots department, location,
 * manager, skip-level manager, department head and job level, and pins the template each person
 * fills in for every phase. Safe to re-run; opts.onlyStaffIds limits it to specific employees.
 */
export async function enrollCycleParticipants(
  tx: Prisma.TransactionClient,
  cycle: EnrollableCycle,
  via: "ACTIVATION" | "SYNC",
  opts: { onlyStaffIds?: string[] } = {},
): Promise<{ created: PeerParticipant[]; withoutTemplate: number }> {
  const excludedStaffIds = await loadExcludedStaffIds(tx, cycle.id);
  const existing = new Set(
    (
      await tx.appraisalCycleParticipant.findMany({
        where: { cycleId: cycle.id },
        select: { staffRecordId: true },
      })
    ).map((r) => r.staffRecordId),
  );

  const staff = await tx.staffRecord.findMany({
    where: {
      AND: [
        enrollmentWhere(cycle, excludedStaffIds),
        ...(opts.onlyStaffIds ? [{ id: { in: opts.onlyStaffIds } }] : []),
      ],
    },
    select: {
      id: true,
      departmentId: true,
      locationId: true,
      managerId: true,
      designationId: true,
      designation: { select: { seniorityBand: true } },
      manager: { select: { managerId: true } },
    },
  });
  const joiners = staff.filter((s) => !existing.has(s.id));
  if (joiners.length === 0) return { created: [], withoutTemplate: 0 };

  const deptIds = [
    ...new Set(
      joiners.map((s) => s.departmentId).filter((d): d is string => !!d),
    ),
  ];
  const depts = deptIds.length
    ? await tx.department.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, head: { select: { id: true } } },
      })
    : [];
  const headByDept = new Map(depts.map((d) => [d.id, d.head?.id ?? null]));

  const CHUNK = 1000;
  for (let i = 0; i < joiners.length; i += CHUNK) {
    await tx.appraisalCycleParticipant.createMany({
      data: joiners.slice(i, i + CHUNK).map((s) => ({
        cycleId: cycle.id,
        companyId: cycle.companyId,
        staffRecordId: s.id,
        departmentId: s.departmentId,
        locationId: s.locationId,
        managerId: s.managerId,
        designationId: s.designationId,
        seniorityBand: s.designation?.seniorityBand ?? null,
        skipLevelManagerId: s.manager?.managerId ?? null,
        departmentHeadId: s.departmentId
          ? (headByDept.get(s.departmentId) ?? null)
          : null,
        enrolledVia: via,
      })),
      skipDuplicates: true,
    });
  }

  const joinerIds = new Set(joiners.map((s) => s.id));
  const rows = (
    await tx.appraisalCycleParticipant.findMany({
      where: { cycleId: cycle.id },
      select: {
        id: true,
        staffRecordId: true,
        departmentId: true,
        designationId: true,
        seniorityBand: true,
        managerId: true,
      },
    })
  ).filter((r) => joinerIds.has(r.staffRecordId));

  const assignmentRows = await tx.templateAssignment.findMany({
    where: {
      cycleId: cycle.id,
      status: "ACTIVE",
      phaseType: { in: TEMPLATE_PHASES },
    },
    select: {
      id: true,
      phaseType: true,
      scopeType: true,
      assignedAt: true,
      departmentScopes: { select: { departmentId: true } },
      jobLevelScopes: { select: { seniorityBand: true } },
    },
  });
  const byPhase = new Map<ReviewPhaseType, ResolvableAssignment[]>();
  for (const a of assignmentRows) {
    if (!a.phaseType) continue;
    byPhase.set(a.phaseType, [
      ...(byPhase.get(a.phaseType) ?? []),
      toResolvable(a),
    ]);
  }

  const enabled = cycle.phases.filter((p) => p.enabled).map((p) => p.phaseType);
  const phaseRows: Prisma.AppraisalParticipantPhaseCreateManyInput[] = [];
  const missing = new Set<string>();
  for (const r of rows) {
    const resolveFor = (pt: ReviewPhaseType) =>
      resolveAssignment(byPhase.get(pt) ?? [], r.departmentId, r.seniorityBand)
        ?.id ?? null;
    // Calibration and HR Validation work from the Manager Review form.
    const managerAssignment = enabled.includes("MANAGER_REVIEW")
      ? resolveFor("MANAGER_REVIEW")
      : null;
    for (const pt of enabled) {
      const isFormPhase = TEMPLATE_PHASES.includes(pt);
      const assignmentId = isFormPhase ? resolveFor(pt) : managerAssignment;
      if (isFormPhase && !assignmentId) missing.add(r.id);
      phaseRows.push({
        participantId: r.id,
        cycleId: cycle.id,
        phaseType: pt,
        assignmentId,
      });
    }
  }
  for (let i = 0; i < phaseRows.length; i += CHUNK) {
    await tx.appraisalParticipantPhase.createMany({
      data: phaseRows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  return {
    created: rows.map((r) => ({
      id: r.id,
      staffRecordId: r.staffRecordId,
      managerId: r.managerId,
      departmentId: r.departmentId,
    })),
    withoutTemplate: missing.size,
  };
}

// New joiners get peers like everyone else: same rules, balanced against everyone's existing workload.
export async function fillPeersForJoiners(
  tx: Prisma.TransactionClient,
  cycle: {
    id: string;
    companyId: string;
    peersPerEmployee: number;
    phases: { phaseType: ReviewPhaseType; enabled: boolean }[];
  },
  joiners: PeerParticipant[],
) {
  if (
    joiners.length === 0 ||
    !cycle.phases.some((p) => p.phaseType === "PEER_REVIEW" && p.enabled)
  )
    return 0;
  const all = await tx.appraisalCycleParticipant.findMany({
    where: { cycleId: cycle.id },
    select: {
      id: true,
      staffRecordId: true,
      managerId: true,
      departmentId: true,
    },
  });
  const activeRows = await tx.staffRecord.findMany({
    where: { id: { in: all.map((p) => p.staffRecordId) }, isActive: true },
    select: { id: true },
  });
  const active = new Set(activeRows.map((r) => r.id));
  const existing = await tx.appraisalPeerAssignment.findMany({
    where: { cycleId: cycle.id },
    select: { participantId: true, reviewerStaffId: true },
  });
  const { pairs } = generatePeerPairs({
    targets: joiners.filter((j) => active.has(j.staffRecordId)),
    pool: all.filter((p) => active.has(p.staffRecordId)),
    peersPerEmployee: cycle.peersPerEmployee,
    existing,
  });
  if (pairs.length) {
    await tx.appraisalPeerAssignment.createMany({
      data: pairs.map((p) => ({
        ...p,
        cycleId: cycle.id,
        companyId: cycle.companyId,
        source: "AUTO" as const,
      })),
      skipDuplicates: true,
    });
  }
  return pairs.length;
}

export interface SyncPreview {
  joiners: { id: string; name: string }[];
  leavers: {
    participantId: string;
    staffRecordId: string;
    name: string;
    started: boolean;
  }[];
}

export async function previewSync(
  client: Prisma.TransactionClient,
  cycle: EnrollableCycle,
): Promise<SyncPreview> {
  const excludedStaffIds = await loadExcludedStaffIds(client, cycle.id);
  const [enrolled, eligible, leaverRows] = await Promise.all([
    client.appraisalCycleParticipant.findMany({
      where: { cycleId: cycle.id },
      select: { staffRecordId: true },
    }),
    client.staffRecord.findMany({
      where: enrollmentWhere(cycle, excludedStaffIds),
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    client.appraisalCycleParticipant.findMany({
      where: { cycleId: cycle.id, staffRecord: { isActive: false } },
      select: {
        id: true,
        staffRecordId: true,
        staffRecord: { select: { firstName: true, lastName: true } },
        phases: { select: { status: true } },
        selfAppraisal: { select: { id: true } },
        managerReview: { select: { id: true } },
      },
    }),
  ]);
  const have = new Set(enrolled.map((r) => r.staffRecordId));
  return {
    joiners: eligible
      .filter((s) => !have.has(s.id))
      .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
    leavers: leaverRows.map((p) => ({
      participantId: p.id,
      staffRecordId: p.staffRecordId,
      name: `${p.staffRecord.firstName} ${p.staffRecord.lastName}`,
      started: isStarted(p),
    })),
  };
}

export async function applyParticipantSync(
  tx: Prisma.TransactionClient,
  cycle: EnrollableCycle & { peersPerEmployee: number },
  preview: SyncPreview,
  actorId: string,
) {
  const removable = preview.leavers.filter((l) => !l.started);
  let peerSlotsToRefill = 0;
  if (removable.length > 0) {
    // Pairs where a leaver was the reviewer leave their colleagues one short.
    const removedPairs = await tx.appraisalPeerAssignment.deleteMany({
      where: {
        cycleId: cycle.id,
        reviewerStaffId: { in: removable.map((l) => l.staffRecordId) },
      },
    });
    peerSlotsToRefill = removedPairs.count;
    await tx.appraisalCycleParticipant.deleteMany({
      where: { id: { in: removable.map((l) => l.participantId) } },
    });
    await tx.appraisalCycleExclusion.createMany({
      data: removable.map((l) => ({
        cycleId: cycle.id,
        companyId: cycle.companyId,
        staffRecordId: l.staffRecordId,
        reason: "LEFT_COMPANY" as const,
        excludedBy: actorId,
      })),
      skipDuplicates: true,
    });
  }
  const { created, withoutTemplate } = await enrollCycleParticipants(
    tx,
    cycle,
    "SYNC",
  );
  const peerPairsCreated = await fillPeersForJoiners(tx, cycle, created);
  return {
    joined: created.length,
    removed: removable.length,
    keptLeavers: preview.leavers.length - removable.length,
    peerPairsCreated,
    peerSlotsToRefill,
    joinersWithoutTemplate: withoutTemplate,
    joinedStaffIds: created.map((c) => c.staffRecordId),
  };
}
