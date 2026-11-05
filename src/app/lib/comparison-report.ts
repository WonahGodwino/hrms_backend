import { ComparisonReportType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import type { Actor } from "@/app/lib/manager-review";
import { DAY, nameOf } from "@/app/lib/pip";
import {
  createNotification,
  NOTIFICATION_TYPES,
} from "@/app/lib/notifications/helpers";
import { HR_REVIEWER_ROLES } from "@/app/lib/performance-operations/ops-utils";
import { RATING_LABELS, STATUS_LABELS } from "@/app/lib/calibration";
import { loadScopedStaff } from "@/app/lib/promotion";
import type { PdfSection } from "@/app/lib/comparison-export";
import {
  BAND_LABELS,
  EVOLUTION_CYCLES,
  FOCUS,
  MIN_GROUP,
  COMPARE_MAX,
  applyFilters,
  avg,
  cycleTime,
  getBasis,
  goalCounts,
  groupBy,
  loadCycleRows,
  loadPopulation,
  parseFilters,
  personCycles,
  radarFor,
  resolveFocus,
} from "@/app/lib/comparison";
import type { Basis, Filters, Member } from "@/app/lib/comparison";

const r1 = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : String(Math.round(n * 10) / 10);
export const MAX_REPORTS = 100;
export const METRICS = [
  "KPI_COMPLETION",
  "COMPETENCY_RADAR",
  "PERFORMANCE_VELOCITY",
  "CALIBRATION_VARIANCE",
] as const;
export type ReportMetric = (typeof METRICS)[number];
export const TIMEFRAMES = { CYCLE: 1, LAST_4: 4, LAST_6: 6 } as const;

export type ReportConfig = {
  type: ComparisonReportType;
  metrics: ReportMetric[];
  timeframe: keyof typeof TIMEFRAMES;
  filters: Filters;
  staffRecordIds: string[];
};

// ---------------------------------------------------------------------------
// Config validation (decisions 22, 23)
// ---------------------------------------------------------------------------
export function parseReportConfig(
  body: any,
  actor: Actor,
): { config: ReportConfig } | { error: string } {
  if (body?.type !== "DEPARTMENT_BENCHMARK" && body?.type !== "PEER_COMPARISON")
    return { error: "type must be DEPARTMENT_BENCHMARK or PEER_COMPARISON" };
  const metrics = Array.isArray(body.metrics)
    ? [...new Set<string>(body.metrics)]
    : [];
  if (
    !metrics.length ||
    metrics.some((m) => !METRICS.includes(m as ReportMetric))
  )
    return {
      error: `metrics must be a non-empty list from: ${METRICS.join(", ")}`,
    };
  if (metrics.includes("CALIBRATION_VARIANCE") && !actor.companyWide)
    return {
      error:
        "Calibration variances are only available to HR and administrators",
    };
  const timeframe = body.timeframe ?? "CYCLE";
  if (!(timeframe in TIMEFRAMES))
    return {
      error: `timeframe must be one of: ${Object.keys(TIMEFRAMES).join(", ")}`,
    };

  const f = body.filters ?? {};
  const sp = new URLSearchParams();
  if (f.departmentId) sp.set("departmentId", String(f.departmentId));
  if (Array.isArray(f.bands) && f.bands.length)
    sp.set("bands", f.bands.join(","));
  if (f.kpiMin !== undefined) sp.set("kpiMin", String(f.kpiMin));
  if (f.kpiMax !== undefined) sp.set("kpiMax", String(f.kpiMax));
  if (Array.isArray(body.competencyIds) && body.competencyIds.length)
    sp.set("competencyIds", body.competencyIds.join(","));
  const parsed = parseFilters(sp);
  if ("error" in parsed) return parsed;

  const ids = Array.isArray(body.staffRecordIds)
    ? [
        ...new Set<string>(
          body.staffRecordIds.filter((x: unknown) => typeof x === "string"),
        ),
      ]
    : [];
  if (
    body.type === "PEER_COMPARISON" &&
    (ids.length < 2 || ids.length > COMPARE_MAX)
  )
    return {
      error: `Select 2 to ${COMPARE_MAX} employees for a peer comparison`,
    };
  return {
    config: {
      type: body.type,
      metrics: metrics as ReportMetric[],
      timeframe,
      filters: parsed.filters,
      staffRecordIds: ids,
    },
  };
}

// ---------------------------------------------------------------------------
// Snapshot: frozen, printable sections. Only data the viewer could already see.
// ---------------------------------------------------------------------------
export async function buildSnapshot(
  companyId: string,
  actor: Actor,
  basis: Basis,
  cfg: ReportConfig,
): Promise<
  { snapshot: Prisma.InputJsonValue } | { error: string; status: number }
> {
  const cycle = basis.cycle as NonNullable<Basis["cycle"]>;
  const all = await loadPopulation(companyId, actor, cycle);
  const focus = await resolveFocus(companyId, all, cfg.filters.competencyIds);
  const cycles = basis.recent.slice(0, TIMEFRAMES[cfg.timeframe]).reverse(); // oldest first
  const has = (m: ReportMetric) => cfg.metrics.includes(m);
  const sections: PdfSection[] = [];

  if (cfg.type === "DEPARTMENT_BENCHMARK") {
    const pop = applyFilters(all, { ...cfg.filters, competencyIds: [] });
    const groups = new Map<string, Member[]>();
    for (const m of pop)
      groups.set(m.departmentId ?? "none", [
        ...(groups.get(m.departmentId ?? "none") ?? []),
        m,
      ]);
    const shown = [...groups.entries()].filter(
      ([, v]) => !actor.companyWide || v.length >= MIN_GROUP,
    );
    const hiddenCount = groups.size - shown.length;
    sections.push({
      heading: "Scope",
      lines: [
        `Cycle: ${cycle.name}`,
        `Employees in scope: ${pop.length}`,
        `Departments shown: ${shown.length}`,
        ...(hiddenCount
          ? [
              `Departments hidden (fewer than ${MIN_GROUP} people): ${hiddenCount}`,
            ]
          : []),
      ],
    });
    const dname = (v: Member[]) => v[0].departmentName ?? "Unassigned";

    if (has("KPI_COMPLETION"))
      sections.push({
        heading: "KPI completion",
        columns: ["Department", "Employees", "Avg KPI %", "Avg score %"],
        rows: shown.map(([, v]) => [
          dname(v),
          v.length,
          r1(avg(v.flatMap((m) => (m.kpi === null ? [] : [m.kpi])))),
          r1(avg(v.map((m) => m.score))),
        ]),
      });
    if (has("COMPETENCY_RADAR"))
      sections.push({
        heading: "Competency scores (%)",
        columns: ["Department", ...focus.map((c) => c.name)],
        rows: shown.map(([, v]) => [
          dname(v),
          ...focus.map((c) =>
            r1(avg(v.flatMap((m) => m.competencies.get(c.id)?.pct ?? []))),
          ),
        ]),
      });
    if (has("PERFORMANCE_VELOCITY")) {
      const rows = await loadCycleRows(
        companyId,
        actor,
        cycles.map((c) => c.id),
        cfg.filters.departmentId,
      );
      const byKey = groupBy(
        rows,
        (r) => `${r.departmentId ?? "none"}|${r.cycleId}`,
      );
      sections.push({
        heading: "Performance velocity (avg score %)",
        columns: ["Department", ...cycles.map((c) => c.name)],
        rows: shown.map(([key, v]) => [
          dname(v),
          ...cycles.map((c) => {
            const rs = (byKey.get(`${key}|${c.id}`) ?? []).filter(
              (x) => x.score !== null,
            );
            return new Set(rs.map((x) => x.staffRecordId)).size >=
              (actor.companyWide ? MIN_GROUP : 1)
              ? r1(avg(rs.map((x) => x.score as number)))
              : "-";
          }),
        ]),
      });
    }
    if (has("CALIBRATION_VARIANCE")) {
      const recs = await prisma.calibrationRecord.findMany({
        where: {
          companyId,
          cycleId: cycle.id,
          staffRecordId: { in: pop.map((m) => m.staffRecordId) },
          status: { in: ["ADJUSTED", "APPROVED", "FINALIZED"] },
        },
        select: {
          staffRecordId: true,
          originalRating: true,
          proposedRating: true,
        },
      });
      const rec = new Map(recs.map((r) => [r.staffRecordId, r] as const));
      sections.push({
        heading: "Calibration variances",
        columns: ["Department", "Reviewed", "Adjusted", "Adjusted %"],
        rows: shown.map(([, v]) => {
          const rv = v.flatMap((m) => rec.get(m.staffRecordId) ?? []);
          const adj = rv.filter(
            (r) => r.originalRating !== r.proposedRating,
          ).length;
          return [
            dname(v),
            rv.length,
            adj,
            rv.length ? Math.round((adj / rv.length) * 100) : "-",
          ];
        }),
      });
    }
  } else {
    const members = cfg.staffRecordIds.flatMap(
      (id) => all.find((m) => m.staffRecordId === id) ?? [],
    );
    if (members.length !== cfg.staffRecordIds.length)
      return {
        error: "Some selected employees are not available in this cycle",
        status: 409,
      };
    const ids = members.map((m) => m.staffRecordId);
    sections.push({
      heading: "Scope",
      lines: [
        `Cycle: ${cycle.name}`,
        `Employees compared: ${members.map((m) => m.name).join(", ")}`,
      ],
    });

    if (has("KPI_COMPLETION")) {
      const goals = await goalCounts(companyId, ids, cycle);
      sections.push({
        heading: "KPI completion",
        columns: [
          "Employee",
          "KPI %",
          "Score %",
          "Band",
          "Goals done",
          "Goals missed",
        ],
        rows: members.map((m) => [
          m.name,
          r1(m.kpi),
          r1(m.score),
          BAND_LABELS[m.band],
          goals.get(m.staffRecordId)?.completed ?? 0,
          goals.get(m.staffRecordId)?.missed ?? 0,
        ]),
      });
    }
    if (has("COMPETENCY_RADAR"))
      sections.push({
        heading: "Competency scores (%)",
        columns: ["Employee", ...focus.map((c) => c.name)],
        rows: members.map((m) => [
          m.name,
          ...radarFor(m, focus).map((x) => (x.rated ? x.A : "-")),
        ]),
      });
    if (has("PERFORMANCE_VELOCITY")) {
      const hist = await personCycles(companyId, ids);
      sections.push({
        heading: "Performance velocity (score %)",
        columns: ["Employee", ...cycles.map((c) => c.name)],
        rows: members.map((m) => [
          m.name,
          ...cycles.map((c) =>
            r1(
              (hist.get(m.staffRecordId) ?? []).find((x) => x.cycleId === c.id)
                ?.score,
            ),
          ),
        ]),
      });
    }
    if (has("CALIBRATION_VARIANCE")) {
      const recs = await prisma.calibrationRecord.findMany({
        where: { companyId, cycleId: cycle.id, staffRecordId: { in: ids } },
        select: {
          staffRecordId: true,
          originalRating: true,
          proposedRating: true,
          status: true,
        },
      });
      const rec = new Map(recs.map((r) => [r.staffRecordId, r] as const));
      sections.push({
        heading: "Calibration variances",
        columns: ["Employee", "Original rating", "Proposed rating", "Status"],
        rows: members.map((m) => {
          const r = rec.get(m.staffRecordId);
          return [
            m.name,
            r ? RATING_LABELS[r.originalRating] : "-",
            r ? RATING_LABELS[r.proposedRating] : "-",
            r ? STATUS_LABELS[r.status] : "-",
          ];
        }),
      });
    }
  }
  return {
    snapshot: {
      cycle: { id: cycle.id, name: cycle.name },
      scope: actor.companyWide ? "COMPANY" : "TEAM",
      sections,
    } as unknown as Prisma.InputJsonValue,
  };
}

// ---------------------------------------------------------------------------
// Profile (drawer + profile PDF, decision 24)
// ---------------------------------------------------------------------------
export async function buildProfile(
  companyId: string,
  actor: Actor,
  actorStaffId: string | null,
  staffRecordId: string,
  cycleId: string | null,
) {
  const staff = await loadScopedStaff(prisma, companyId, staffRecordId, actor);
  if (!staff) return { error: "Employee not found", status: 404 as const };
  const basis = await getBasis(companyId, actor, cycleId);
  if ("error" in basis) return basis;
  const employee = {
    id: staff.id,
    staffNumber: staff.staffId,
    name: nameOf(staff) ?? "",
    avatarUrl: staff.avatarUrl,
    isActive: staff.isActive,
    roleTitle: staff.designation?.title ?? staff.position,
    departmentName: staff.departments?.name ?? staff.department ?? null,
  };
  const permissions = {
    canAssignDevelopment: staff.isActive && staff.id !== actorStaffId,
  };
  const cycle = basis.cycle;
  const all = cycle ? await loadPopulation(companyId, actor, cycle) : [];
  const me = all.find((m) => m.staffRecordId === staffRecordId);
  if (!cycle || !me)
    return {
      data: {
        cycle: cycle ? { id: cycle.id, name: cycle.name } : null,
        released: false,
        employee,
        permissions,
      },
    };

  const [hist, training, recognitions] = await Promise.all([
    personCycles(companyId, [staffRecordId]),
    prisma.participantProgress.findMany({
      where: { companyId, employeeId: staffRecordId },
      select: { trainingStatus: true },
    }),
    prisma.recognition.count({
      where: {
        companyId,
        recipientId: staffRecordId,
        createdAt: { gte: new Date(Date.now() - 365 * DAY) },
        visibility: { not: "PRIVATE" },
      },
    }),
  ]);
  const peers = all.filter((m) => m.staffRecordId !== staffRecordId);
  const at = cycleTime(cycle);
  const competencies = [...me.competencies.entries()]
    .map(([id, c]) => {
      const vals = peers.flatMap((p) => p.competencies.get(id)?.pct ?? []);
      const peerPct =
        vals.length >= (actor.companyWide ? MIN_GROUP : 1)
          ? (avg(vals) as number)
          : null;
      return {
        competencyId: id,
        name: c.name,
        pct: Math.round(c.pct),
        peerPct: peerPct === null ? null : Math.round(peerPct),
        diffPoints: peerPct === null ? null : Math.round(c.pct - peerPct),
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);
  const done = training.filter((t) => t.trainingStatus === "COMPLETED").length;

  return {
    data: {
      cycle: { id: cycle.id, name: cycle.name },
      released: true,
      employee: {
        ...employee,
        tenureMonths: me.tenureMonths,
        managerName: me.managerName,
      },
      score: Math.round(me.score * 10) / 10,
      kpi: me.kpi === null ? null : Math.round(me.kpi),
      band: me.band,
      bandLabel: BAND_LABELS[me.band],
      promotionReady: me.promotionReady,
      kpiEvolution: (hist.get(staffRecordId) ?? [])
        .filter((c) => c.time <= at)
        .slice(-EVOLUTION_CYCLES)
        .map((c) => ({
          cycleId: c.cycleId,
          period: c.period,
          kpi: c.kpi === null ? null : Math.round(c.kpi),
          score: c.score === null ? null : Math.round(c.score),
        })),
      competencies,
      development: {
        trainingAssigned: training.length,
        trainingCompleted: done,
        trainingCompletedPct: training.length
          ? Math.round((done / training.length) * 100)
          : null,
        recognitions,
      },
      permissions,
    },
  };
}

export function profileSections(d: any): PdfSection[] {
  const e = d.employee;
  return [
    {
      heading: "Summary",
      lines: [
        `Employee: ${e.name}`,
        `Role: ${e.roleTitle ?? "-"}`,
        `Department: ${e.departmentName ?? "-"}`,
        `Manager: ${e.managerName ?? "-"}`,
        `Cycle: ${d.cycle.name}`,
        `Score: ${r1(d.score)}%`,
        `KPI: ${d.kpi ?? "-"}%`,
        `Band: ${d.bandLabel}`,
      ],
    },
    {
      heading: "Recent cycles",
      columns: ["Cycle", "KPI %", "Score %"],
      rows: d.kpiEvolution.map((c: any) => [c.period, c.kpi, c.score]),
    },
    {
      heading: "Competencies",
      columns: ["Competency", "Score %", "Peer avg %", "Difference"],
      rows: d.competencies.map((c: any) => [
        c.name,
        c.pct,
        c.peerPct,
        c.diffPoints,
      ]),
    },
    {
      heading: "Development and recognition",
      lines: [
        `Training completed: ${d.development.trainingCompletedPct ?? "-"}% (${d.development.trainingCompleted} of ${d.development.trainingAssigned})`,
        `Recognitions in the last 12 months: ${d.development.recognitions}`,
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Sharing: every active HR/Admin except the sharer. Runs after commit, never throws.
// ---------------------------------------------------------------------------
export async function notifyReportShared(p: {
  companyId: string;
  reportId: string;
  actorId: string;
  title: string;
}) {
  try {
    const actor = await prisma.staffRecord.findUnique({
      where: { id: p.actorId },
      select: { firstName: true, lastName: true },
    });
    const hr = await prisma.staffRecord.findMany({
      where: {
        companyId: p.companyId,
        isActive: true,
        role: { in: HR_REVIEWER_ROLES },
        id: { not: p.actorId },
      },
      select: { id: true },
      take: 25,
    });
    await Promise.all(
      hr.map((h) =>
        createNotification(
          h.id,
          NOTIFICATION_TYPES.COMPARISON_REPORT_SHARED,
          "Comparison report shared",
          `${nameOf(actor) ?? "A manager"} shared the report "${p.title}" with HR.`,
          { reportId: p.reportId },
          p.companyId,
        ),
      ),
    );
  } catch (e) {
    console.error("notifyReportShared failed", e);
  }
}
export const canSeeReport = (
  a: Actor,
  staffId: string | null,
  r: { createdById: string; status: string },
) =>
  !!staffId &&
  (r.createdById === staffId || (a.companyWide && r.status === "SHARED"));
export const REPORT_LABELS: Record<string, string> = {
  DEPARTMENT_BENCHMARK: "Department Benchmark",
  PEER_COMPARISON: "Employee Peer Comparison",
  EMPLOYEE_PROFILE: "Employee Profile",
};
