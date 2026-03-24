// src/components/onboarding/ProgressStatusBadge.jsx
import React from "react";
import clsx from "clsx";

/**
 * ProgressStatusBadge
 *
 * Props:
 *  - percent?: number    // 0-100, optional
 *  - status?: string     // optional explicit status: 'PENDING'|'IN_PROGRESS'|'COMPLETED'|'DELAYED'|'BLOCKED'
 *  - label?: string      // optional override for displayed text
 *
 * Behavior:
 *  - If `status` provided, rely on it.
 *  - Otherwise infer status from `percent`.
 *  - Renders a compact pill with color indicating status.
 */

const STATUS_MAP = {
  COMPLETED: { text: "Completed", className: "bg-green-100 text-green-800" },
  IN_PROGRESS: { text: "In progress", className: "bg-blue-100 text-blue-800" },
  PENDING: { text: "Not started", className: "bg-gray-100 text-gray-700" },
  DELAYED: { text: "Delayed", className: "bg-red-100 text-red-800" },
  BLOCKED: { text: "Blocked", className: "bg-red-100 text-red-800" },
};

const inferStatusFromPercent = (percent = 0) => {
  if (percent >= 100) return "COMPLETED";
  if (percent >= 50) return "IN_PROGRESS";
  if (percent > 0) return "IN_PROGRESS";
  return "PENDING";
};

const ProgressStatusBadge = ({
  percent = null,
  status = null,
  label = null,
}) => {
  const clampedPercent =
    typeof percent === "number" && !Number.isNaN(percent)
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : null;

  const resolvedStatus = status
    ? status.toString().toUpperCase()
    : clampedPercent !== null
    ? inferStatusFromPercent(clampedPercent)
    : "PENDING";

  const meta = STATUS_MAP[resolvedStatus] || STATUS_MAP.PENDING;
  const displayText =
    label ?? (clampedPercent !== null ? `${clampedPercent}%` : meta.text);

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        meta.className
      )}
      aria-label={`status-${resolvedStatus.toLowerCase()}`}
      title={meta.text}
    >
      {displayText}
    </span>
  );
};

export default ProgressStatusBadge;
