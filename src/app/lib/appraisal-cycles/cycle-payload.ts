import {
  AppraisalCycleType,
  AppraisalCycleScopeType,
  ApprovalRoutingType,
  ReviewPhaseType,
  AppraisalReminderRecipient,
} from "@prisma/client";
import {
  VALID_CYCLE_TYPES,
  VALID_SCOPE_TYPES,
  VALID_PHASE_TYPES,
  VALID_ROUTING_TYPES,
} from "./appraisal-cycle-utils";
import { VALID_REMINDER_RECIPIENTS } from "./workflow-settings-utils";

export interface ParsedPhase {
  phaseType: ReviewPhaseType;
  enabled: boolean;
  deadline: Date | null;
  displayOrder: number;
}

export interface ParsedCyclePayload {
  name?: string;
  type?: AppraisalCycleType;
  customType?: string | null;
  scopeType?: AppraisalCycleScopeType;
  departmentIds?: string[];
  startDate?: Date | null;
  endDate?: Date | null;
  phases?: ParsedPhase[];
  approvalRouting?: ApprovalRoutingType;
  requireHrSignoff?: boolean;
  autoAdvanceApprovals?: boolean;
  remindersEnabled?: boolean;
  reminderLeadHours?: number;
  reminderRecipients?: AppraisalReminderRecipient[];
  escalationEnabled?: boolean;
  escalationThresholdHours?: number;
  peersPerEmployee?: number;
  minTenureMonths?: number;
}

export type ParseResult =
  | { ok: true; data: ParsedCyclePayload }
  | { ok: false; error: string };

export const DEFAULT_PHASES: ParsedPhase[] = [
  {
    phaseType: "SELF_APPRAISAL",
    enabled: true,
    deadline: null,
    displayOrder: 1,
  },
  {
    phaseType: "MANAGER_REVIEW",
    enabled: true,
    deadline: null,
    displayOrder: 2,
  },
  { phaseType: "PEER_REVIEW", enabled: false, deadline: null, displayOrder: 3 },
  {
    phaseType: "LEADERSHIP_CALIBRATION",
    enabled: false,
    deadline: null,
    displayOrder: 4,
  },
  {
    phaseType: "HR_VALIDATION",
    enabled: false,
    deadline: null,
    displayOrder: 5,
  },
];

const BOOLEAN_FIELDS = [
  "requireHrSignoff",
  "autoAdvanceApprovals",
  "remindersEnabled",
  "escalationEnabled",
] as const;
const INT_FIELDS = [
  ["reminderLeadHours", 1, 720],
  ["escalationThresholdHours", 1, 720],
  ["peersPerEmployee", 1, 5],
  ["minTenureMonths", 0, 60],
] as const;

// One validator for POST and PATCH. In "update" mode only the fields present are parsed.
export function parseCyclePayload(
  body: any,
  mode: "create" | "update",
): ParseResult {
  const out: ParsedCyclePayload = {};
  const fail = (error: string): ParseResult => ({ ok: false, error });
  const present = (k: string) => body?.[k] !== undefined;

  if (mode === "create" || present("name")) {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return fail("name is required.");
    if (name.length > 120) return fail("name must be 120 characters or fewer.");
    out.name = name;
  }

  if (mode === "create" || present("type")) {
    const type = String(body?.type ?? "")
      .toUpperCase()
      .replace(/-/g, "_") as AppraisalCycleType;
    if (!VALID_CYCLE_TYPES.includes(type)) {
      return fail(
        `Invalid type. Must be one of: ${VALID_CYCLE_TYPES.join(", ")}`,
      );
    }
    const custom =
      typeof body?.customType === "string" ? body.customType.trim() : "";
    if (type === "OTHER" && !custom)
      return fail("customType is required when type is OTHER.");
    out.type = type;
    out.customType = type === "OTHER" ? custom : null;
  }

  if (present("scopeType")) {
    const s = String(body.scopeType).toUpperCase() as AppraisalCycleScopeType;
    if (!VALID_SCOPE_TYPES.includes(s)) {
      return fail(
        `Invalid scopeType. Must be one of: ${VALID_SCOPE_TYPES.join(", ")}`,
      );
    }
    out.scopeType = s;
  }
  if (present("departmentIds")) {
    const ids = body.departmentIds;
    if (
      !Array.isArray(ids) ||
      ids.some((d: unknown) => typeof d !== "string" || !d)
    ) {
      return fail("departmentIds must be a list of department ids.");
    }
    out.departmentIds = [...new Set<string>(ids)];
  }

  for (const k of ["startDate", "endDate"] as const) {
    if (!present(k)) continue;
    const v = body[k];
    if (v === null || v === "") {
      out[k] = null;
    } else {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return fail(`${k} is not a valid date.`);
      out[k] = d;
    }
  }

  if (present("phases")) {
    if (!Array.isArray(body.phases)) return fail("phases must be a list.");
    const seen = new Set<string>();
    const phases: ParsedPhase[] = [];
    for (let i = 0; i < body.phases.length; i++) {
      const p = body.phases[i] ?? {};
      const phaseType = String(
        p.phaseType ?? "",
      ).toUpperCase() as ReviewPhaseType;
      if (!VALID_PHASE_TYPES.includes(phaseType))
        return fail(`Invalid phaseType: ${p.phaseType}`);
      if (seen.has(phaseType))
        return fail(`Phase ${phaseType} is listed more than once.`);
      seen.add(phaseType);
      if (p.enabled !== undefined && typeof p.enabled !== "boolean") {
        return fail(`Phase ${phaseType}: enabled must be true or false.`);
      }
      let deadline: Date | null = null;
      if (p.deadline) {
        deadline = new Date(p.deadline);
        if (Number.isNaN(deadline.getTime()))
          return fail(`Phase ${phaseType}: deadline is not a valid date.`);
      }
      const displayOrder =
        Number.isInteger(p.displayOrder) && p.displayOrder >= 0
          ? p.displayOrder
          : i + 1;
      phases.push({
        phaseType,
        enabled: p.enabled ?? true,
        deadline,
        displayOrder,
      });
    }
    out.phases = phases;
  }

  if (present("approvalRouting")) {
    const r = String(body.approvalRouting).toUpperCase() as ApprovalRoutingType;
    if (!VALID_ROUTING_TYPES.includes(r)) {
      return fail(
        `Invalid approvalRouting. Must be one of: ${VALID_ROUTING_TYPES.join(", ")}`,
      );
    }
    out.approvalRouting = r;
  }

  for (const k of BOOLEAN_FIELDS) {
    if (!present(k)) continue;
    if (typeof body[k] !== "boolean")
      return fail(`${k} must be true or false.`);
    (out as any)[k] = body[k];
  }

  for (const [k, min, max] of INT_FIELDS) {
    if (!present(k)) continue;
    const n = body[k];
    if (!Number.isInteger(n) || n < min || n > max) {
      return fail(`${k} must be a whole number from ${min} to ${max}.`);
    }
    (out as any)[k] = n;
  }

  if (present("reminderRecipients")) {
    if (!Array.isArray(body.reminderRecipients))
      return fail("reminderRecipients must be a list.");
    const list = [
      ...new Set(
        body.reminderRecipients.map((x: unknown) => String(x).toUpperCase()),
      ),
    ] as AppraisalReminderRecipient[];
    const bad = list.find((x) => !VALID_REMINDER_RECIPIENTS.includes(x));
    if (bad) return fail(`Invalid reminder recipient: ${bad}`);
    out.reminderRecipients = list;
  }

  return { ok: true, data: out };
}

// The scope the cycle will have after this request. ALL_DEPARTMENTS always means zero scope rows.
export function resolveScope(
  parsed: ParsedCyclePayload,
  existing?: {
    scopeType: AppraisalCycleScopeType;
    departmentScopes: { departmentId: string }[];
  },
) {
  const scopeType =
    parsed.scopeType ?? existing?.scopeType ?? "ALL_DEPARTMENTS";
  const touched =
    parsed.scopeType !== undefined || parsed.departmentIds !== undefined;
  if (scopeType === "ALL_DEPARTMENTS")
    return { scopeType, departmentIds: [] as string[], touched };
  const departmentIds =
    parsed.departmentIds ??
    existing?.departmentScopes.map((d) => d.departmentId) ??
    [];
  return { scopeType, departmentIds, touched };
}
