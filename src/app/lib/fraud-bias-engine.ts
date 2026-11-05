import prisma from "@/app/lib/prisma";
import {
  MIN_GROUP,
  SCAN_THROTTLE_MS,
  INTEGRITY_TARGET,
  OPEN_SIGNAL,
  SEV,
  RULES,
  RISK_LABELS,
  Level,
  Cycle,
  mean,
  stdev,
  r1,
  isUnique,
  dayStart,
  httpErr,
  listReviewedCycles,
  staffNames,
  deptNames,
  EmptyReason,
  noReviews,
} from "@/app/lib/fraud-bias";

// ---------------------------------------------------------------- base data
export type RV = {
  id: string;
  reviewerId: string | null;
  staffRecordId: string;
  departmentId: string | null;
  gender: "M" | "F" | null;
  overall: number | null;
  eff: number | null;
  comments: string | null;
  submittedAt: Date | null;
};
export type Base = {
  companyId: string;
  cycleId: string;
  reviews: RV[];
  calib: { departmentId: string | null; raised: boolean }[];
  recs: {
    id: string;
    createdById: string;
    staffRecordId: string;
    status: string;
    overall: number | null;
  }[];
  noms: {
    id: string;
    staffRecordId: string;
    nominatedById: string;
    readiness: string;
  }[];
};
const RANK: Record<string, number> = {
  UNSATISFACTORY: 0,
  NEEDS_IMPROVEMENT: 1,
  MEETS_EXPECTATIONS: 2,
  EXCEEDS_EXPECTATIONS: 3,
  OUTSTANDING: 4,
};
const genderOf = (g: unknown): "M" | "F" | null => {
  const s = String(g ?? "")
    .trim()
    .toLowerCase();
  return s.startsWith("f") ? "F" : s.startsWith("m") ? "M" : null;
};

export async function loadBase(
  companyId: string,
  cycleId: string,
): Promise<Base> {
  const [reviews, calib, recs, noms] = await Promise.all([
    prisma.managerReview.findMany({
      where: { companyId, cycleId, status: "SUBMITTED" },
      select: {
        id: true,
        reviewerId: true,
        staffRecordId: true,
        overallScore: true,
        calibratedOverallScore: true,
        finalComments: true,
        submittedAt: true,
        participant: { select: { departmentId: true } },
        staffRecord: { select: { gender: true } },
      },
    }),
    prisma.calibrationRecord.findMany({
      where: { companyId, cycleId },
      select: {
        originalRating: true,
        proposedRating: true,
        participant: { select: { departmentId: true } },
      },
    }),
    prisma.promotionRecommendation.findMany({
      where: {
        companyId,
        cycleId,
        status: { in: ["SUBMITTED", "APPROVED", "REJECTED"] },
      },
      select: {
        id: true,
        createdById: true,
        staffRecordId: true,
        status: true,
        overallScore: true,
      },
    }),
    prisma.successionCandidate.findMany({
      where: { companyId, removedAt: null },
      select: {
        id: true,
        staffRecordId: true,
        nominatedById: true,
        readiness: true,
      },
    }),
  ]);
  return {
    companyId,
    cycleId,
    reviews: reviews.map((r) => ({
      id: r.id,
      reviewerId: r.reviewerId,
      staffRecordId: r.staffRecordId,
      departmentId: r.participant?.departmentId ?? null,
      gender: genderOf(r.staffRecord?.gender),
      overall: r.overallScore,
      eff: r.calibratedOverallScore ?? r.overallScore,
      comments: r.finalComments,
      submittedAt: r.submittedAt,
    })),
    calib: calib.map((c) => ({
      departmentId: c.participant?.departmentId ?? null,
      raised: (RANK[c.proposedRating] ?? 0) > (RANK[c.originalRating] ?? 0),
    })),
    recs: recs.map((r) => ({
      id: r.id,
      createdById: r.createdById,
      staffRecordId: r.staffRecordId,
      status: r.status,
      overall: r.overallScore,
    })),
    noms: noms.map((n) => ({
      id: n.id,
      staffRecordId: n.staffRecordId,
      nominatedById: n.nominatedById,
      readiness: n.readiness,
    })),
  };
}

// ---------------------------------------------------------------- detection (pure)
export type RuleHit = {
  signalKey: string;
  ruleKey: string;
  category: string;
  severity: Level;
  managerId: string | null;
  departmentId: string | null;
  subjectRef: string | null;
  title: string;
  summary: string;
  affectedCount: number;
  evidence: any;
};
export type Cell = {
  level: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT" | "NOT_ASSESSED";
  value?: number;
  baseline?: number;
  n?: number;
};
export type HeatRow = {
  departmentId: string;
  reviewed: number;
  cells: {
    ratingInflation: Cell;
    promotionBias: Cell;
    genderBias: Cell;
    suppression: Cell;
  };
};

const up = (v: number, m: number, h: number): Level | null =>
  v >= h ? "HIGH" : v >= m ? "MEDIUM" : null;
const down = (v: number, m: number, h: number): Level | null =>
  v < h ? "HIGH" : v < m ? "MEDIUM" : null;
function groupBy<T>(xs: T[], f: (x: T) => string | null | undefined) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = f(x);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}
const POOL_MIN_SCORE = 75; // HIGH performance band; stands in for the promotion pool (see notes)
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function detect(base: Base) {
  const { cycleId } = base;
  const hits: RuleHit[] = [];
  const th = (r: string) => ({ medium: RULES[r].medium, high: RULES[r].high });
  const add = (
    rule: string,
    severity: Level,
    subject: string,
    h: Partial<RuleHit> & {
      summary: string;
      affectedCount: number;
      evidence: any;
    },
  ) =>
    hits.push({
      signalKey: `${rule}:${cycleId}:${subject}`,
      ruleKey: rule,
      category: RULES[rule].category,
      severity,
      title: RULES[rule].title,
      managerId: null,
      departmentId: null,
      subjectRef: null,
      ...h,
    });

  const scored = base.reviews.filter((r) => r.overall != null);
  const enough = scored.length >= MIN_GROUP;
  const companyMean = mean(scored.map((r) => r.overall!));

  // ---- manager statistical rules
  if (enough) {
    for (const [mid, rs] of groupBy(scored, (r) => r.reviewerId)) {
      if (rs.length < MIN_GROUP) continue;
      const scores = rs.map((r) => r.overall!);
      const m = mean(scores),
        gap = m - companyMean,
        sd = stdev(scores);
      const ev = (
        rule: string,
        metric: string,
        value: number,
        baseline: number | null,
      ) => ({
        metric,
        value: r1(value),
        baseline: baseline == null ? null : r1(baseline),
        gap: baseline == null ? null : r1(value - baseline),
        n: rs.length,
        thresholds: th(rule),
      });
      const inf = up(gap, 10, 15);
      if (inf)
        add("MANAGER_RATING_INFLATION", inf, mid, {
          managerId: mid,
          affectedCount: rs.length,
          evidence: ev("MANAGER_RATING_INFLATION", "meanScore", m, companyMean),
          summary: `Average score ${r1(m)} is ${r1(gap)} points above the company average of ${r1(companyMean)}.`,
        });
      const sup = up(-gap, 10, 15);
      if (sup)
        add("MANAGER_RATING_SUPPRESSION", sup, mid, {
          managerId: mid,
          affectedCount: rs.length,
          evidence: ev(
            "MANAGER_RATING_SUPPRESSION",
            "meanScore",
            m,
            companyMean,
          ),
          summary: `Average score ${r1(m)} is ${r1(-gap)} points below the company average of ${r1(companyMean)}.`,
        });
      const uni = down(sd, 3, 1);
      if (uni)
        add("MANAGER_UNIFORM_RATINGS", uni, mid, {
          managerId: mid,
          affectedCount: rs.length,
          evidence: ev("MANAGER_UNIFORM_RATINGS", "scoreStdDev", sd, null),
          summary: `Scores across ${rs.length} reviews barely vary (standard deviation ${r1(sd)}).`,
        });
    }
  }

  // ---- manager process rules (no minimum)
  for (const [mid, rs] of groupBy(base.reviews, (r) => r.reviewerId)) {
    const ts = rs
      .filter((r) => r.submittedAt)
      .sort((a, b) => a.submittedAt!.getTime() - b.submittedAt!.getTime());
    let best = 0,
      bs = 0,
      be = 0,
      j = 0;
    for (let i = 0; i < ts.length; i++) {
      while (
        ts[i].submittedAt!.getTime() - ts[j].submittedAt!.getTime() >
        10 * 60 * 1000
      )
        j++;
      if (i - j + 1 > best) {
        best = i - j + 1;
        bs = j;
        be = i;
      }
    }
    const bulk = up(best, 8, 15);
    if (bulk)
      add("BULK_SUBMISSION", bulk, mid, {
        managerId: mid,
        affectedCount: best,
        evidence: {
          metric: "reviewsIn10Min",
          value: best,
          thresholds: th("BULK_SUBMISSION"),
          affectedStaffIds: ts.slice(bs, be + 1).map((r) => r.staffRecordId),
        },
        summary: `${best} reviews were submitted within 10 minutes.`,
      });

    const dup = groupBy(
      rs.filter((r) => (r.comments ?? "").trim().length >= 20),
      (r) => normalize(r.comments!),
    );
    let top: RV[] = [];
    for (const g of dup.values()) if (g.length > top.length) top = g;
    const d = up(top.length, 3, 5);
    if (d)
      add("DUPLICATE_COMMENTS", d, mid, {
        managerId: mid,
        affectedCount: top.length,
        evidence: {
          metric: "identicalComments",
          value: top.length,
          thresholds: th("DUPLICATE_COMMENTS"),
          affectedStaffIds: top.map((r) => r.staffRecordId),
        },
        summary: `The same final comment appears on ${top.length} reviews.`,
      });
  }

  // ---- department rules + heatmap
  const pool = scored.filter((r) => r.eff! > POOL_MIN_SCORE);
  const recd = new Set(
    base.recs
      .filter((x) =>
        new Set(pool.map((p) => p.staffRecordId)).has(x.staffRecordId),
      )
      .map((x) => x.staffRecordId),
  );
  const companyRate = pool.length ? recd.size / pool.length : 0;
  const promoAssessed = pool.length >= MIN_GROUP && recd.size > 0;
  const companyRaise = base.calib.length
    ? base.calib.filter((c) => c.raised).length / base.calib.length
    : 0;

  const heatmap: HeatRow[] = [];
  for (const [dept, rs] of groupBy(scored, (r) => r.departmentId)) {
    const n = rs.length;
    if (n < MIN_GROUP) {
      const c: Cell = { level: "INSUFFICIENT", n };
      heatmap.push({
        departmentId: dept,
        reviewed: n,
        cells: {
          ratingInflation: c,
          promotionBias: c,
          genderBias: c,
          suppression: c,
        },
      });
      continue;
    }
    const flag = (rule: string, cell: Cell, summary: string, evidence: any) => {
      if (cell.level === "HIGH")
        add(rule, "HIGH", dept, {
          departmentId: dept,
          affectedCount: n,
          summary,
          evidence: { ...evidence, n: cell.n ?? n, thresholds: th(rule) },
        });
    };

    const dm = mean(rs.map((r) => r.overall!));
    const infLevel = up(dm - companyMean, 8, 12);
    const ratingInflation: Cell = {
      level: infLevel ?? "LOW",
      value: r1(dm),
      baseline: r1(companyMean),
      n,
    };
    flag(
      "DEPT_RATING_INFLATION",
      ratingInflation,
      `Department average ${r1(dm)} is ${r1(dm - companyMean)} points above the company average of ${r1(companyMean)}.`,
      {
        metric: "meanScore",
        value: r1(dm),
        baseline: r1(companyMean),
        gap: r1(dm - companyMean),
      },
    );

    let suppression: Cell;
    const dc = base.calib.filter((c) => c.departmentId === dept);
    if (base.calib.length < MIN_GROUP)
      suppression = { level: "NOT_ASSESSED", n: dc.length };
    else if (dc.length < MIN_GROUP)
      suppression = { level: "INSUFFICIENT", n: dc.length };
    else {
      const rate = (dc.filter((c) => c.raised).length / dc.length) * 100;
      const gapPP = rate - companyRaise * 100;
      suppression = {
        level: up(gapPP, 15, 25) ?? "LOW",
        value: r1(rate),
        baseline: r1(companyRaise * 100),
        n: dc.length,
      };
      flag(
        "DEPT_SUPPRESSION",
        suppression,
        `${r1(rate)}% of calibration records were raised, ${r1(gapPP)} points above the company rate.`,
        {
          metric: "calibrationRaiseRatePct",
          value: r1(rate),
          baseline: r1(companyRaise * 100),
          gap: r1(gapPP),
        },
      );
    }

    let genderBias: Cell;
    const men = rs.filter((r) => r.gender === "M").map((r) => r.eff!);
    const women = rs.filter((r) => r.gender === "F").map((r) => r.eff!);
    if (men.length < MIN_GROUP || women.length < MIN_GROUP)
      genderBias = { level: "INSUFFICIENT", n };
    else {
      const gm = mean(men),
        gw = mean(women),
        gap = Math.abs(gm - gw);
      genderBias = {
        level: up(gap, 5, 10) ?? "LOW",
        value: r1(gap),
        n: men.length + women.length,
      };
      flag(
        "DEPT_GENDER_GAP",
        genderBias,
        `Mean effective score differs by ${r1(gap)} points between gender groups.`,
        {
          metric: "genderMeanGap",
          value: r1(gap),
          higherGroup: gm > gw ? "Male" : "Female",
          groupSizes: [men.length, women.length],
        },
      );
    }

    let promotionBias: Cell;
    const dp = pool.filter((r) => r.departmentId === dept);
    if (pool.length < MIN_GROUP)
      promotionBias = { level: "INSUFFICIENT", n: dp.length };
    else if (!promoAssessed)
      promotionBias = { level: "NOT_ASSESSED", n: dp.length };
    else if (dp.length < MIN_GROUP)
      promotionBias = { level: "INSUFFICIENT", n: dp.length };
    else {
      const rate =
        (dp.filter((r) => recd.has(r.staffRecordId)).length / dp.length) * 100;
      const gapPP = companyRate * 100 - rate;
      promotionBias = {
        level: up(gapPP, 20, 35) ?? "LOW",
        value: r1(rate),
        baseline: r1(companyRate * 100),
        n: dp.length,
      };
      flag(
        "DEPT_PROMOTION_DISPARITY",
        promotionBias,
        `${r1(rate)}% of high performers were recommended, ${r1(gapPP)} points below the company rate.`,
        {
          metric: "recommendationRatePct",
          value: r1(rate),
          baseline: r1(companyRate * 100),
          gap: r1(gapPP),
        },
      );
    }

    heatmap.push({
      departmentId: dept,
      reviewed: n,
      cells: { ratingInflation, promotionBias, genderBias, suppression },
    });
  }

  // ---- promotion score mismatch
  for (const x of base.recs)
    if (
      (x.status === "SUBMITTED" || x.status === "APPROVED") &&
      x.overall != null &&
      x.overall < 60
    )
      add("PROMOTION_SCORE_MISMATCH", "HIGH", x.id, {
        managerId: x.createdById,
        subjectRef: x.id,
        affectedCount: 1,
        evidence: {
          metric: "frozenOverallScore",
          value: r1(x.overall),
          threshold: 60,
          status: x.status,
          affectedStaffIds: [x.staffRecordId],
        },
        summary: `A promotion recommendation is ${x.status.toLowerCase()} with a frozen score of ${r1(x.overall)}.`,
      });

  // ---- succession rules
  const total = base.noms.length;
  const byNom = groupBy(base.noms, (n) => n.nominatedById);
  if (total >= MIN_GROUP && byNom.size >= 3)
    for (const [nid, ns] of byNom) {
      if (ns.length < 3) continue;
      const share = (ns.length / total) * 100;
      const lv = up(share, 60, 80);
      if (lv)
        add("NOMINATOR_CONCENTRATION", lv, nid, {
          managerId: nid,
          affectedCount: ns.length,
          evidence: {
            metric: "nominationSharePct",
            value: r1(share),
            n: total,
            nominations: ns.length,
            nominators: byNom.size,
            thresholds: th("NOMINATOR_CONCENTRATION"),
          },
          summary: `One nominator accounts for ${r1(share)}% of active succession nominations.`,
        });
    }
  const effBy = new Map(scored.map((r) => [r.staffRecordId, r.eff!]));
  for (const n of base.noms) {
    const e = effBy.get(n.staffRecordId);
    if (n.readiness === "READY_NOW" && e != null && e < 60)
      add("SUCCESSION_SCORE_MISMATCH", "HIGH", n.id, {
        managerId: n.nominatedById,
        subjectRef: n.id,
        affectedCount: 1,
        evidence: {
          metric: "effectiveScore",
          value: r1(e),
          threshold: 60,
          affectedStaffIds: [n.staffRecordId],
        },
        summary: `A Ready Now successor has an effective score of ${r1(e)}.`,
      });
  }

  return { hits, heatmap, companyMean };
}

// ---------------------------------------------------------------- scoring (decisions 9, 26)
export type SigLite = {
  ruleKey: string;
  severity: string;
  managerId: string | null;
  departmentId: string | null;
  subjectRef: string | null;
};
const W = (s: string) => (s === "HIGH" ? 1 : 0.5);
function maxMap(sigs: SigLite[], key: (s: SigLite) => string | null) {
  const m = new Map<string, number>();
  for (const s of sigs) {
    const k = key(s);
    if (k) m.set(k, Math.max(m.get(k) ?? 0, W(s.severity)));
  }
  return m;
}
const pct = (flagged: number, units: number) =>
  units < MIN_GROUP ? null : r1(100 * (1 - flagged / units));

export function scoreDomains(base: Base, sigs: SigLite[]) {
  const dom = (d: string) => sigs.filter((s) => RULES[s.ruleKey]?.domain === d);
  const scored = base.reviews.filter((r) => r.overall != null);

  const a = dom("APPRAISAL");
  const am = maxMap(a, (s) => s.managerId),
    ad = maxMap(a, (s) => s.departmentId);
  const aFlag = scored.reduce(
    (t, r) =>
      t +
      Math.max(
        am.get(r.reviewerId ?? "") ?? 0,
        ad.get(r.departmentId ?? "") ?? 0,
      ),
    0,
  );
  const appraisal = pct(aFlag, scored.length);

  const p = dom("PROMOTION");
  const pd = maxMap(
    p.filter((s) => s.ruleKey === "DEPT_PROMOTION_DISPARITY"),
    (s) => s.departmentId,
  );
  const pr = maxMap(
    p.filter((s) => s.ruleKey === "PROMOTION_SCORE_MISMATCH"),
    (s) => s.subjectRef,
  );
  const pool = scored.filter((r) => r.eff! > POOL_MIN_SCORE);
  const active = base.recs.filter(
    (x) => x.status === "SUBMITTED" || x.status === "APPROVED",
  );
  const pFlag =
    pool.reduce((t, r) => t + (pd.get(r.departmentId ?? "") ?? 0), 0) +
    active.reduce((t, x) => t + (pr.get(x.id) ?? 0), 0);
  const promotion = pct(pFlag, pool.length + active.length);

  const s = dom("SUCCESSION");
  const sn = maxMap(
    s.filter((x) => x.ruleKey === "NOMINATOR_CONCENTRATION"),
    (x) => x.managerId,
  );
  const sm = maxMap(
    s.filter((x) => x.ruleKey === "SUCCESSION_SCORE_MISMATCH"),
    (x) => x.subjectRef,
  );
  const sFlag = base.noms.reduce(
    (t, n) => t + Math.max(sn.get(n.nominatedById) ?? 0, sm.get(n.id) ?? 0),
    0,
  );
  const succession = pct(sFlag, base.noms.length);

  const vals = [appraisal, promotion, succession].filter(
    (v): v is number => v != null,
  );
  return {
    appraisal,
    promotion,
    succession,
    org: vals.length ? r1(mean(vals)) : null,
  };
}

// ---------------------------------------------------------------- scan + reconcile
export async function runScan(
  companyId: string,
  cycleId: string,
  trigger: "READ" | "MANUAL" | "SCHEDULED",
) {
  const now = new Date();
  const key = { companyId, cycleId };
  const existing = await prisma.fairnessDetectionRun.findUnique({
    where: { companyId_cycleId: key },
  });
  if (!existing) {
    try {
      await prisma.fairnessDetectionRun.create({
        data: { ...key, ranAt: now, trigger },
      });
    } catch (e) {
      if (isUnique(e)) return { ran: false, lastScannedAt: now };
      throw e;
    }
  } else {
    const claim = await prisma.fairnessDetectionRun.updateMany({
      where:
        trigger === "MANUAL"
          ? key
          : {
              ...key,
              ranAt: { lt: new Date(now.getTime() - SCAN_THROTTLE_MS) },
            },
      data: { ranAt: now, trigger },
    });
    if (claim.count === 0) return { ran: false, lastScannedAt: existing.ranAt };
  }

  const base = await loadBase(companyId, cycleId);
  const { hits } = detect(base);
  const olds = await prisma.fairnessSignal.findMany({ where: key });
  const byKey = new Map(olds.map((s) => [s.signalKey, s]));
  let created = 0,
    cleared = 0;
  const sys = { actorName: "System", companyId };

  await prisma.$transaction(
    async (tx) => {
      const seen = new Set<string>();
      for (const h of hits) {
        seen.add(h.signalKey);
        const ex: any = byKey.get(h.signalKey);
        const fresh = {
          title: h.title,
          summary: h.summary,
          affectedCount: h.affectedCount,
          evidence: h.evidence,
          lastDetectedAt: now,
        };
        if (!ex) {
          await tx.fairnessSignal.create({
            data: {
              companyId,
              cycleId,
              signalKey: h.signalKey,
              ruleKey: h.ruleKey,
              category: h.category as any,
              severity: h.severity,
              managerId: h.managerId,
              departmentId: h.departmentId,
              subjectRef: h.subjectRef,
              firstDetectedAt: now,
              ...fresh,
              history: {
                create: {
                  ...sys,
                  action: "DETECTED",
                  newData: { severity: h.severity },
                },
              },
            },
          });
          created++;
          continue;
        }
        const changed = h.severity !== ex.severity;
        const rose = SEV[h.severity] > SEV[ex.severity];
        const hist = (action: string, previousData?: any, newData?: any) =>
          tx.fairnessSignalHistory.create({
            data: { signalId: ex.id, ...sys, action, previousData, newData },
          });

        if (ex.status === "DISMISSED") {
          if (rose) {
            await tx.fairnessSignal.update({
              where: { id: ex.id },
              data: {
                ...fresh,
                severity: h.severity,
                status: "OPEN",
                dismissedAt: null,
                dismissedByUserId: null,
                dismissedByName: null,
                dismissalNote: null,
              },
            });
            await hist(
              "REOPENED",
              {
                status: "DISMISSED",
                severity: ex.severity,
                dismissalNote: ex.dismissalNote,
              },
              { status: "OPEN", severity: h.severity },
            );
          } else
            await tx.fairnessSignal.update({
              where: { id: ex.id },
              data: fresh,
            });
        } else if (ex.status === "CLEARED") {
          await tx.fairnessSignal.update({
            where: { id: ex.id },
            data: {
              ...fresh,
              severity: h.severity,
              status: "OPEN",
              clearedAt: null,
            },
          });
          await hist(
            "REOPENED",
            { status: "CLEARED" },
            { status: "OPEN", severity: h.severity },
          );
        } else {
          await tx.fairnessSignal.update({
            where: { id: ex.id },
            data: { ...fresh, severity: h.severity },
          });
          if (changed)
            await hist(
              "SEVERITY_CHANGED",
              { severity: ex.severity },
              { severity: h.severity },
            );
        }
      }
      for (const ex of olds)
        if (!seen.has(ex.signalKey) && ex.status === "OPEN") {
          await tx.fairnessSignal.update({
            where: { id: ex.id },
            data: { status: "CLEARED", clearedAt: now },
          });
          await tx.fairnessSignalHistory.create({
            data: { signalId: ex.id, ...sys, action: "CLEARED" },
          });
          cleared++;
        }
    },
    { timeout: 30000, maxWait: 10000 },
  );

  const open = await prisma.fairnessSignal.count({
    where: { ...key, status: { in: OPEN_SIGNAL as any } },
  });
  await prisma.fairnessDetectionRun.update({
    where: { companyId_cycleId: key },
    data: {
      reviewsScanned: base.reviews.length,
      signalsOpen: open,
      signalsNew: created,
      signalsCleared: cleared,
    },
  });
  return {
    ran: true,
    lastScannedAt: now,
    reviewsScanned: base.reviews.length,
    signalsOpen: open,
    signalsNew: created,
    signalsCleared: cleared,
  };
}

export type View = {
  basis: Cycle | null;
  cycles: Cycle[];
  run: { lastScannedAt: Date; reviewsScanned: number } | null;
};
export async function getView(
  companyId: string,
  cycleId?: string | null,
): Promise<View> {
  const cycles = await listReviewedCycles(companyId);
  let basis: Cycle | null = cycles[0] ?? null;
  if (cycleId) {
    basis = cycles.find((c) => c.id === cycleId) ?? null;
    if (!basis)
      throw httpErr(404, "That cycle has no submitted manager reviews");
  }
  if (!basis) return { basis: null, cycles, run: null };
  await runScan(companyId, basis.id, "READ");
  const run = await prisma.fairnessDetectionRun.findUnique({
    where: { companyId_cycleId: { companyId, cycleId: basis.id } },
  });
  return {
    basis,
    cycles,
    run: run
      ? { lastScannedAt: run.ranAt, reviewsScanned: run.reviewsScanned }
      : null,
  };
}

export function signalEmpty(
  view: View,
  total: number,
  anyOpen: number,
): EmptyReason {
  if (total > 0) return null;
  if (!view.basis) return noReviews();
  if ((view.run?.reviewsScanned ?? 0) < MIN_GROUP && anyOpen === 0)
    return {
      code: "INSUFFICIENT_DATA",
      message: `Fewer than ${MIN_GROUP} reviews were submitted in ${view.basis.name}. Group checks need a larger sample; process checks still run.`,
    };
  if (anyOpen === 0)
    return {
      code: "NO_SIGNALS",
      message: `The last scan found nothing to review in ${view.basis.name}.`,
    };
  return {
    code: "FILTERED_OUT",
    message: "No signals match the current filters.",
  };
}

export async function reviewedByDept(companyId: string, cycleId: string) {
  const rows = await prisma.managerReview.findMany({
    where: {
      companyId,
      cycleId,
      status: "SUBMITTED",
      overallScore: { not: null },
    },
    select: { participant: { select: { departmentId: true } } },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = r.participant?.departmentId;
    if (d) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}

// ---------------------------------------------------------------- serializers
export function serializeSignal(
  s: any,
  staff: Map<string, string>,
  depts: Map<string, string>,
) {
  const link = s.caseLinks?.[0]?.case;
  const { affectedStaffIds, ...evidence } = (s.evidence ?? {}) as any;
  return {
    id: s.id,
    ruleKey: s.ruleKey,
    category: s.category,
    severity: s.severity,
    status: s.status,
    title: s.title,
    summary: s.summary,
    affectedCount: s.affectedCount,
    riskCategory: RULES[s.ruleKey]?.risk ?? "OTHER",
    riskLabel: RISK_LABELS[RULES[s.ruleKey]?.risk ?? "OTHER"],
    managerId: s.managerId,
    managerName: s.managerId ? (staff.get(s.managerId) ?? null) : null,
    departmentId: s.departmentId,
    departmentName: s.departmentId ? (depts.get(s.departmentId) ?? null) : null,
    subjectRef: s.subjectRef,
    firstDetectedAt: s.firstDetectedAt,
    lastDetectedAt: s.lastDetectedAt,
    caseId: link?.id ?? null,
    caseRef: link ? `FB-${link.caseNumber}` : null,
    hasAffectedEmployees:
      Array.isArray(affectedStaffIds) && affectedStaffIds.length > 0,
    evidence,
  };
}
export const SIGNAL_INCLUDE = {
  caseLinks: {
    where: { activeKey: { not: null } },
    select: { case: { select: { id: true, caseNumber: true, status: true } } },
  },
};

// ---------------------------------------------------------------- summary (KPIs) + snapshots
export async function buildSummary(companyId: string, view: View) {
  const now = new Date();
  const [groups, resolved90, auditFlags] = await Promise.all([
    prisma.fairnessCase.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
    }),
    prisma.fairnessCase.count({
      where: {
        companyId,
        status: "RESOLVED",
        resolvedAt: { gte: new Date(now.getTime() - 90 * 864e5) },
      },
    }),
    prisma.performanceAuditEvent.count({
      where: { companyId, flagged: true, resolvedAt: null },
    }),
  ]);
  const cc = (s: string) =>
    groups.find((g) => g.status === s)?._count._all ?? 0;
  const active = cc("OPEN") + cc("INVESTIGATING") + cc("ESCALATED");
  const investigations = (delta: number | null) => ({
    id: "investigations-queue",
    title: "Investigations",
    value: active,
    subtext: "Total Active Cases",
    items: [
      { label: "Pending", val: cc("OPEN") },
      { label: "Resolved", val: resolved90 },
    ],
    delta,
    higherIsBetter: false,
  });
  const lastScannedAt = view.run?.lastScannedAt ?? null;

  if (!view.basis) {
    const blank = (
      id: string,
      title: string,
      subtext: string,
      items: string[],
    ) => ({
      id,
      title,
      value: null,
      subtext,
      items: items.map((l) => ({ label: l, val: null })),
      delta: null,
      higherIsBetter: false,
    });
    return {
      basisCycle: null,
      lastScannedAt,
      scores: null,
      emptyReason: noReviews(),
      kpis: [
        blank("integrity-score", "Integrity Score", "Org Governance", [
          "Target",
          "Appraisal",
        ]),
        blank("bias-alerts", "Bias Alerts", "Active Flags", [
          "New",
          "Escalated",
        ]),
        blank("fraud-indicators", "Fraud Indicators", "Open Indicators", [
          "Ratings",
          "Promotion & Succession",
        ]),
        blank("governance-violations", "Violations", "Policy Breaches", [
          "Audit Flags",
          "Governance signals",
        ]),
        blank("at-risk-managers", "At-Risk Managers", "Under Review", [
          "Repeat",
          "Single Event",
        ]),
        investigations(null),
      ],
    };
  }

  const cycleId = view.basis.id;
  const [sigs, base] = await Promise.all([
    prisma.fairnessSignal.findMany({
      where: { companyId, cycleId, status: { in: OPEN_SIGNAL as any } },
      select: {
        ruleKey: true,
        category: true,
        severity: true,
        managerId: true,
        departmentId: true,
        subjectRef: true,
        firstDetectedAt: true,
        caseLinks: {
          where: { activeKey: { not: null } },
          select: { case: { select: { status: true } } },
        },
      },
    }),
    loadBase(companyId, cycleId),
  ]);
  const scores = scoreDomains(base, sigs);
  const of = (cat: string) => sigs.filter((s) => s.category === cat);
  const bias = of("BIAS"),
    fraud = of("FRAUD"),
    gov = of("GOVERNANCE");
  const weekAgo = now.getTime() - 7 * 864e5;
  const atRisk = [
    ...new Set(sigs.map((s) => s.managerId).filter(Boolean) as string[]),
  ];
  const prior = atRisk.length
    ? await prisma.fairnessSignal.findMany({
        where: {
          companyId,
          cycleId: { not: cycleId },
          managerId: { in: atRisk },
          status: { not: "DISMISSED" },
        },
        select: { managerId: true },
        distinct: ["managerId"],
      })
    : [];

  // daily snapshot (lazy, company-wide, immutable) then deltas against one at least 28 days old
  const today = dayStart(now);
  try {
    await prisma.fairnessMetricSnapshot.create({
      data: {
        companyId,
        capturedOn: today,
        basisCycleId: cycleId,
        reviewedCount: base.reviews.length,
        integrityScore: scores.org,
        biasAlerts: bias.length,
        fraudIndicators: fraud.length,
        governanceSignals: gov.length,
        auditFlags,
        highSeveritySignals: sigs.filter((s) => s.severity === "HIGH").length,
        atRiskManagers: atRisk.length,
        openCases: active,
        appraisalFairness: scores.appraisal,
        promotionFairness: scores.promotion,
        successionObjectivity: scores.succession,
      },
    });
  } catch (e) {
    if (!isUnique(e)) throw e;
  }
  const prev = await prisma.fairnessMetricSnapshot.findFirst({
    where: {
      companyId,
      capturedOn: { lte: new Date(today.getTime() - 28 * 864e5) },
    },
    orderBy: { capturedOn: "desc" },
  });
  const d = (cur: number | null, p: number | null | undefined) =>
    cur == null || p == null ? null : r1(cur - p);
  const escalated = (xs: typeof sigs) =>
    xs.filter((s) => s.caseLinks.some((l) => l.case.status === "ESCALATED"))
      .length;
  const n = (...rules: string[]) =>
    fraud.filter((s) => rules.includes(s.ruleKey)).length;

  return {
    basisCycle: { id: view.basis.id, name: view.basis.name },
    lastScannedAt,
    scores: { ...scores, target: INTEGRITY_TARGET },
    emptyReason:
      base.reviews.length < MIN_GROUP
        ? {
            code: "INSUFFICIENT_DATA",
            message: `Fewer than ${MIN_GROUP} reviews were submitted in ${view.basis.name}. Scores need a larger sample.`,
          }
        : null,
    kpis: [
      {
        id: "integrity-score",
        title: "Integrity Score",
        value: scores.org,
        subtext: "Org Governance",
        items: [
          { label: "Target", val: INTEGRITY_TARGET },
          { label: "Appraisal", val: scores.appraisal },
        ],
        delta: d(scores.org, prev?.integrityScore),
        higherIsBetter: true,
      },
      {
        id: "bias-alerts",
        title: "Bias Alerts",
        value: bias.length,
        subtext: "Active Flags",
        items: [
          {
            label: "New",
            val: bias.filter((s) => s.firstDetectedAt.getTime() >= weekAgo)
              .length,
          },
          { label: "Escalated", val: escalated(bias) },
        ],
        delta: d(bias.length, prev?.biasAlerts),
        higherIsBetter: false,
      },
      {
        id: "fraud-indicators",
        title: "Fraud Indicators",
        value: fraud.length,
        subtext: "Open Indicators",
        highSeverity: fraud.filter((s) => s.severity === "HIGH").length,
        items: [
          { label: "Ratings", val: n("BULK_SUBMISSION", "DUPLICATE_COMMENTS") },
          {
            label: "Promotion & Succession",
            val: n("PROMOTION_SCORE_MISMATCH", "SUCCESSION_SCORE_MISMATCH"),
          },
        ],
        delta: d(fraud.length, prev?.fraudIndicators),
        higherIsBetter: false,
      },
      {
        id: "governance-violations",
        title: "Violations",
        value: auditFlags + gov.length,
        subtext: "Policy Breaches",
        items: [
          { label: "Audit Flags", val: auditFlags },
          { label: "Governance signals", val: gov.length },
        ],
        delta: d(
          auditFlags + gov.length,
          prev ? prev.auditFlags + prev.governanceSignals : null,
        ),
        higherIsBetter: false,
      },
      {
        id: "at-risk-managers",
        title: "At-Risk Managers",
        value: atRisk.length,
        subtext: "Under Review",
        items: [
          { label: "Repeat", val: prior.length },
          { label: "Single Event", val: atRisk.length - prior.length },
        ],
        delta: d(atRisk.length, prev?.atRiskManagers),
        higherIsBetter: false,
      },
      investigations(d(active, prev?.openCases)),
    ],
  };
}
