// src/components/ui/InviteStatusBadge.jsx
import React from "react";

/**
 * InviteStatusBadge
 *
 * Props:
 *  - status: string (required) — normalized status like 'pending'|'accepted'|'expired'|'revoked' (case-insensitive)
 *  - size?: 'sm' | 'md' (default 'md')
 *  - tooltip?: string (optional) - shown as title attribute
 *  - className?: string (optional) - tailwind classes to extend/override
 *
 * Behavior:
 *  - normalizes incoming status strings and maps them to visual styles + labels
 *  - adds data-status attribute for tests and aria-label for accessibility
 */

const STATUS_MAP = {
  pending: { label: "Pending", tone: "amber", emoji: "⏳" },
  sent: { label: "Pending", tone: "amber", emoji: "⏳" },
  created: { label: "Pending", tone: "amber", emoji: "⏳" },
  waiting: { label: "Pending", tone: "amber", emoji: "⏳" },

  accepted: { label: "Accepted", tone: "green", emoji: "✅" },
  used: { label: "Accepted", tone: "green", emoji: "✅" },
  completed: { label: "Accepted", tone: "green", emoji: "✅" },

  expired: { label: "Expired", tone: "slate", emoji: "⌛" },
  exp: { label: "Expired", tone: "slate", emoji: "⌛" },

  revoked: { label: "Revoked", tone: "red", emoji: "⛔" },
  cancelled: { label: "Revoked", tone: "red", emoji: "⛔" },
  canceled: { label: "Revoked", tone: "red", emoji: "⛔" },
  revoked_by_admin: { label: "Revoked", tone: "red", emoji: "⛔" },

  default: { label: "Unknown", tone: "blue", emoji: "ℹ️" },
};

const TONE_CLASSES = {
  slate: "text-slate-700 bg-slate-100 ring-slate-200",
  amber: "text-amber-800 bg-amber-100 ring-amber-200",
  green: "text-emerald-800 bg-emerald-100 ring-emerald-200",
  red: "text-red-700 bg-red-100 ring-red-200",
  blue: "text-sky-800 bg-sky-100 ring-sky-200",
};

/**
 * Normalize incoming status value to a canonical key used by STATUS_MAP.
 * Handles case-insensitivity, common synonyms, and substring matches for robustness.
 */
function normalizeKey(rawStatus) {
  if (rawStatus == null) return "default";
  const s = String(rawStatus).trim().toLowerCase();

  // direct match
  if (STATUS_MAP[s]) return s;

  // synonyms / exact alias mapping
  const alias = {
    sent: "pending",
    create: "pending",
    created: "pending",
    waiting: "pending",
    pending: "pending",

    accepted: "accepted",
    use: "accepted",
    used: "accepted",
    completed: "accepted",

    expired: "expired",
    exp: "expired",

    revoked: "revoked",
    cancel: "revoked",
    cancelled: "revoked",
    canceled: "revoked",
    revoked_by_admin: "revoked",
  }[s];
  if (alias) return alias;

  // substring heuristics (helps with values like "PENDING", "INVITE_PENDING", "STATUS_EXPIRED", etc.)
  if (s.includes("pend")) return "pending";
  if (s.includes("accept") || s.includes("used") || s.includes("complete"))
    return "accepted";
  if (s.includes("expir")) return "expired";
  if (s.includes("revoke") || s.includes("cancel")) return "revoked";

  return "default";
}

export default function InviteStatusBadge({
  status,
  size = "md",
  tooltip,
  className = "",
}) {
  const raw = (status ?? "").toString();
  const key = normalizeKey(raw);
  const map = STATUS_MAP[key] ?? STATUS_MAP.default;
  const toneClass = TONE_CLASSES[map.tone] ?? TONE_CLASSES.blue;

  const sizeClass =
    size === "sm"
      ? "text-xs px-2 py-2 rounded-md"
      : "text-sm px-3 py-1 rounded-md";

  const combined =
    `inline-flex items-center gap-2 ${sizeClass} ${toneClass} ${className}`.trim();

  return (
    <span
      role="status"
      aria-label={`Invite status: ${map.label}`}
      title={tooltip ?? map.label}
      data-status={key || "unknown"}
      className={combined}
    >
      <span aria-hidden="true" className="leading-none">
        {map.emoji}
      </span>
      <span className="leading-none">{map.label}</span>
    </span>
  );
}
