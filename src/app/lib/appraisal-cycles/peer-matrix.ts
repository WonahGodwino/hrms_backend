import { Prisma, AppraisalCycleStatus, ReviewPhaseType } from "@prisma/client";

export class PeerMatrixError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Participants are enrolled when a cycle is activated, so that's when a matrix exists.
export const PEER_EDITABLE_STATUSES: AppraisalCycleStatus[] = [
  "ACTIVE",
  "PAUSED",
  "ESCALATED",
];
export const MAX_PEERS_PER_EMPLOYEE = 5;

type PeerCycle = {
  name: string;
  status: AppraisalCycleStatus;
  phases: { phaseType: ReviewPhaseType; enabled: boolean }[];
};

export function getPeerEditability(
  cycle: PeerCycle,
): { canEdit: true } | { canEdit: false; status: number; reason: string } {
  if (!cycle.phases.some((p) => p.phaseType === "PEER_REVIEW" && p.enabled)) {
    return {
      canEdit: false,
      status: 400,
      reason: "This cycle doesn't have Peer Review enabled.",
    };
  }
  if (PEER_EDITABLE_STATUSES.includes(cycle.status)) return { canEdit: true };
  if (cycle.status === "DRAFT" || cycle.status === "SCHEDULED") {
    return {
      canEdit: false,
      status: 409,
      reason: `Peer reviewers are assigned when "${cycle.name}" is activated. It's still ${cycle.status.toLowerCase()}.`,
    };
  }
  return {
    canEdit: false,
    status: 409,
    reason: `"${cycle.name}" is ${cycle.status.toLowerCase()}, so its peer matrix can't be changed.`,
  };
}

export function assertPeerEditable(cycle: PeerCycle) {
  const r = getPeerEditability(cycle);
  if (!r.canEdit) throw new PeerMatrixError(r.status, r.reason);
}

// Compare-and-set on status: re-validates the cycle and locks its row until the transaction commits.
export async function lockPeerCycle(
  tx: Prisma.TransactionClient,
  cycleId: string,
  companyId: string,
  actorId: string,
  data: { peersPerEmployee?: number } = {},
) {
  const res = await tx.appraisalCycle.updateMany({
    where: { id: cycleId, companyId, status: { in: PEER_EDITABLE_STATUSES } },
    data: { updatedBy: actorId, ...data },
  });
  if (res.count === 0) {
    throw new PeerMatrixError(
      409,
      "This cycle's status just changed, so its peer matrix can't be edited. Refresh and try again.",
    );
  }
}

export function peerExclusionReason(
  participant: { staffRecordId: string; managerId: string | null },
  reviewer: { id: string; managerId: string | null },
): string | null {
  if (reviewer.id === participant.staffRecordId)
    return "An employee can't be their own peer reviewer.";
  if (reviewer.id === participant.managerId) {
    return "An employee's manager reviews them in the manager phase, so they can't also be a peer.";
  }
  if (reviewer.managerId === participant.staffRecordId) {
    return "A direct report can't be a peer reviewer of their own manager.";
  }
  return null;
}

export interface PeerParticipant {
  id: string;
  staffRecordId: string;
  managerId: string | null;
  departmentId: string | null;
}
export interface PeerPair {
  participantId: string;
  reviewerStaffId: string;
}

/**
 * targets: employees to fill up; pool: everyone who may review (cycle-wide);
 * existing: pairs that stay (manual overrides, other departments). They count toward
 * both each employee's target and each reviewer's load.
 * Order of preference: same manager, then same department, then anyone, lowest load first.
 */
export function generatePeerPairs(input: {
  targets: PeerParticipant[];
  pool: PeerParticipant[];
  peersPerEmployee: number;
  existing: PeerPair[];
}) {
  const { targets, pool, peersPerEmployee, existing } = input;
  const byStaff = new Map(pool.map((p) => [p.staffRecordId, p]));
  const load = new Map<string, number>();
  const buckets = new Map<number, Set<string>>();
  let maxLoad = 0;

  const place = (id: string, l: number) => {
    let s = buckets.get(l);
    if (!s) buckets.set(l, (s = new Set()));
    s.add(id);
  };

  for (const p of pool) load.set(p.staffRecordId, 0);
  const assigned = new Map<string, Set<string>>();
  for (const e of existing) {
    if (load.has(e.reviewerStaffId))
      load.set(e.reviewerStaffId, load.get(e.reviewerStaffId)! + 1);
    const set = assigned.get(e.participantId) ?? new Set<string>();
    set.add(e.reviewerStaffId);
    assigned.set(e.participantId, set);
  }
  for (const [id, l] of load) {
    place(id, l);
    if (l > maxLoad) maxLoad = l;
  }
  const bump = (id: string) => {
    const l = load.get(id)!;
    buckets.get(l)?.delete(id);
    load.set(id, l + 1);
    place(id, l + 1);
    if (l + 1 > maxLoad) maxLoad = l + 1;
  };

  const byManager = new Map<string, PeerParticipant[]>();
  const byDept = new Map<string, PeerParticipant[]>();
  const push = (
    m: Map<string, PeerParticipant[]>,
    k: string,
    p: PeerParticipant,
  ) => {
    const a = m.get(k);
    if (a) a.push(p);
    else m.set(k, [p]);
  };
  for (const p of pool) {
    if (p.managerId) push(byManager, p.managerId, p);
    if (p.departmentId) push(byDept, p.departmentId, p);
  }

  const pairs: PeerPair[] = [];
  const shortfall: { participantId: string; missing: number }[] = [];

  for (const target of targets) {
    const have = assigned.get(target.id) ?? new Set<string>();
    assigned.set(target.id, have);
    let need = peersPerEmployee - have.size;
    if (need <= 0) continue;

    const eligible = (p: PeerParticipant) =>
      !have.has(p.staffRecordId) &&
      peerExclusionReason(target, {
        id: p.staffRecordId,
        managerId: p.managerId,
      }) === null;
    const take = (p: PeerParticipant) => {
      pairs.push({
        participantId: target.id,
        reviewerStaffId: p.staffRecordId,
      });
      have.add(p.staffRecordId);
      bump(p.staffRecordId);
      need--;
    };

    const tiers = [
      target.managerId ? byManager.get(target.managerId) : undefined,
      target.departmentId ? byDept.get(target.departmentId) : undefined,
    ];
    for (const tier of tiers) {
      if (need <= 0 || !tier) continue;
      const ranked = tier
        .filter(eligible)
        .sort(
          (a, b) =>
            load.get(a.staffRecordId)! - load.get(b.staffRecordId)! ||
            (a.staffRecordId < b.staffRecordId ? -1 : 1),
        );
      for (const c of ranked) {
        if (need <= 0) break;
        take(c);
      }
    }

    if (need > 0) {
      const picks: PeerParticipant[] = [];
      outer: for (let l = 0; l <= maxLoad; l++) {
        const s = buckets.get(l);
        if (!s) continue;
        for (const id of s) {
          const p = byStaff.get(id)!;
          if (eligible(p)) {
            picks.push(p);
            if (picks.length >= need) break outer;
          }
        }
      }
      picks.forEach(take);
    }
    if (need > 0) shortfall.push({ participantId: target.id, missing: need });
  }

  return { pairs, shortfall };
}
