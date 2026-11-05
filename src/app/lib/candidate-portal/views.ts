import { formatJobSalary } from "@/app/lib/recruitment/job-salary";

export const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Applied",
  REVIEWING: "Under review",
  SHORTLISTED: "Shortlisted",
  INTERVIEWING: "Interview stage",
  OFFERED: "Offer extended",
  HIRED: "Hired",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
};
export const GROUPS: Record<string, string[]> = {
  REVIEW: ["SUBMITTED", "REVIEWING", "SHORTLISTED"],
  INTERVIEW: ["INTERVIEWING"],
  OFFER: ["OFFERED"],
  CONCLUDED: ["HIRED", "REJECTED", "WITHDRAWN"],
};
export const ACTIVE_STATUSES = [
  "SUBMITTED",
  "REVIEWING",
  "SHORTLISTED",
  "INTERVIEWING",
  "OFFERED",
];
const STAGES = [
  { status: "SUBMITTED", label: "Application submitted" },
  { status: "REVIEWING", label: "Under review" },
  { status: "SHORTLISTED", label: "Shortlisted" },
  { status: "INTERVIEWING", label: "Interview stage" },
  { status: "OFFERED", label: "Offer extended" },
];
export const WITHDRAW_REASONS = [
  { value: "ACCEPTED_OTHER_OFFER", label: "Accepted another offer" },
  { value: "LOCATION", label: "Location / commute constraints" },
  { value: "COMPENSATION", label: "Compensation mismatch" },
  { value: "SCHEDULE", label: "Schedule conflict" },
  { value: "PERSONAL", label: "Personal reasons" },
  { value: "OTHER", label: "Other" },
];
const OFFER_LABEL: Record<string, string> = {
  SENT: "Awaiting your response",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};
export const notArchived = { OR: [{ archived: 0 }, { archived: null }] };
export const fmtRef = (c: string) =>
  c && c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;

export function toLocationLabel(
  locations: any,
  workplaceType?: string | null,
): string {
  const parts: string[] = [];
  let list = locations;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = null;
    }
  }
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0] || {};
    const loc = [first.city, first.lga, first.state].filter(Boolean).join(", ");
    if (loc) parts.push(loc);
    if (list.length > 1) parts.push(`+${list.length - 1} more`);
  }
  if (workplaceType) parts.unshift(workplaceType);
  return parts.join(" · ") || workplaceType || "";
}

export function jobState(job: {
  status: string;
  archived?: number | null;
  expirationDate?: Date | null;
}) {
  const now = new Date();
  const open = job.status === "ACTIVE" && !job.archived;
  if (open && (!job.expirationDate || job.expirationDate > now)) {
    const daysLeft = job.expirationDate
      ? Math.ceil((+job.expirationDate - +now) / 864e5)
      : null;
    return {
      state: "OPEN",
      daysLeft,
      closingSoon: daysLeft !== null && daysLeft <= 7,
    };
  }
  return {
    state: open ? "EXPIRED" : "CLOSED",
    daysLeft: null,
    closingSoon: false,
  };
}
export const jobSalary = (job: any, currency?: string | null) =>
  formatJobSalary(job, currency) || "Competitive";

// ---------------------------------------------------------------- applications
export const APP_LIST_SELECT = {
  id: true,
  referenceCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  job: {
    select: {
      id: true,
      title: true,
      department: true,
      workplaceType: true,
      locations: true,
      company: { select: { companyName: true } },
    },
  },
  offer: { select: { status: true } },
} as const;

export const APP_DETAIL_SELECT = {
  ...APP_LIST_SELECT,
  metadata: true,
  offer: { select: { status: true, sentAt: true } },
  candidate: { select: { firstName: true, lastName: true, accountId: true } },
  stageHistory: {
    where: notArchived,
    orderBy: { changedAt: "asc" },
    select: { toStatus: true, changedAt: true, changedBy: true, comment: true },
  },
  interviews: {
    where: notArchived,
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      type: true,
      scheduledAt: true,
      durationMins: true,
      location: true,
      meetingLink: true,
      outcome: true,
    },
  },
} as const;

export const canWithdraw = (a: any) =>
  ACTIVE_STATUSES.includes(a.status) && a.offer?.status !== "ACCEPTED";

export function appListDto(a: any) {
  const company = a.job?.company?.companyName ?? "";
  return {
    id: a.id,
    referenceCode: a.referenceCode,
    referenceDisplay: fmtRef(a.referenceCode),
    jobId: a.job?.id ?? null,
    jobTitle: a.job?.title ?? "Role",
    department: a.job?.department ?? "",
    companyName: company,
    logoLetter: (company[0] ?? "C").toUpperCase(),
    location: toLocationLabel(a.job?.locations, a.job?.workplaceType),
    appliedAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    status: a.status,
    statusLabel: STATUS_LABEL[a.status] ?? "In progress",
    group:
      Object.keys(GROUPS).find((g) => GROUPS[g].includes(a.status)) ?? "REVIEW",
    canWithdraw: canWithdraw(a),
  };
}

export function buildTimeline(a: any) {
  const meta =
    a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata)
      ? a.metadata
      : {};
  const first = new Map<string, Date>();
  for (const h of a.stageHistory ?? [])
    if (!first.has(h.toStatus)) first.set(h.toStatus, h.changedAt);
  if (!first.has("SUBMITTED")) first.set("SUBMITTED", a.createdAt);

  const terminal = ["HIRED", "REJECTED", "WITHDRAWN"].includes(a.status);
  const cur = STAGES.findIndex((s) => s.status === a.status);
  const now = new Date();
  const nodes: any[] = [];

  STAGES.forEach((s, i) => {
    const reached = first.has(s.status);
    if (terminal && !reached) return;
    const state = terminal
      ? "done"
      : i < cur
        ? "done"
        : i === cur
          ? "current"
          : "upcoming";
    const at =
      first.get(s.status) ?? (state === "current" ? a.updatedAt : null);
    const node: any = {
      key: s.status,
      label: s.label,
      state,
      date: at ? at.toISOString() : null,
    };
    if (s.status === "INTERVIEWING" && (a.interviews ?? []).length) {
      node.interviews = [...a.interviews]
        .map((iv: any) => {
          const upcoming = iv.scheduledAt >= now && iv.outcome === "PENDING";
          return {
            id: iv.id,
            type: iv.type,
            scheduledAt: iv.scheduledAt.toISOString(),
            durationMins: iv.durationMins ?? null,
            location: upcoming ? (iv.location ?? null) : null,
            meetingLink: upcoming ? (iv.meetingLink ?? null) : null,
            upcoming,
          };
        })
        .sort(
          (x: any, y: any) =>
            Number(y.upcoming) - Number(x.upcoming) ||
            +new Date(x.scheduledAt) - +new Date(y.scheduledAt),
        );
    }
    if (s.status === "OFFERED" && a.offer?.sentAt)
      node.offer = {
        sentAt: a.offer.sentAt.toISOString(),
        statusLabel: OFFER_LABEL[a.offer.status] ?? "Sent",
      };
    nodes.push(node);
  });

  if (terminal) {
    const wd = a.status === "WITHDRAWN";
    nodes.push({
      key: "FINAL",
      label:
        a.status === "HIRED"
          ? "Hired"
          : a.status === "REJECTED"
            ? "Not selected"
            : "Withdrawn by you",
      state: "final",
      tone: a.status === "HIRED" ? "success" : "muted",
      date: (first.get(a.status) ?? a.updatedAt).toISOString(),
      reason: wd ? (meta.withdrawalReason ?? null) : null,
      note: wd ? (meta.withdrawalNote ?? null) : null,
    });
  } else
    nodes.push({
      key: "FINAL",
      label: "Final outcome",
      state: "upcoming",
      date: null,
    });
  return nodes;
}

export function appDetailDto(a: any) {
  const meta =
    a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata)
      ? a.metadata
      : {};
  const withdrawable = canWithdraw(a);
  return {
    ...appListDto(a),
    candidateName:
      `${a.candidate?.firstName ?? ""} ${a.candidate?.lastName ?? ""}`.trim(),
    linked: Boolean(a.candidate?.accountId),
    timeline: buildTimeline(a),
    withdrawal:
      a.status === "WITHDRAWN"
        ? {
            reason: meta.withdrawalReason ?? null,
            note: meta.withdrawalNote ?? null,
            at: meta.withdrawnAt ?? null,
          }
        : null,
    withdrawReasons: withdrawable ? WITHDRAW_REASONS : [],
  };
}
