// src/app/lib/attendance/business-day.ts
//
// Every attendance route independently computed "today"/"start of day" via
// `new Date()` + `.setHours(0,0,0,0)` — which resolves in the SERVER
// PROCESS's local timezone, not the business's (Africa/Lagos, UTC+1, no
// DST). The deployed container runs on node:20-bookworm-slim with no TZ
// env set, so it defaults to UTC. Any attendance action taken in the ~1
// hour window after local midnight in Lagos but before UTC midnight got
// filed under the PREVIOUS calendar day — e.g. clocking in at 00:15 WAT on
// Oct 13 is 23:15 UTC on Oct 12, so `.setHours(0,0,0,0)` on the server
// produced an Oct 12 boundary.
//
// Fix: never use Date's local-time getters/setters (setHours, getDate,
// getDay, getMonth, getFullYear) for business-day math — they depend on the
// process's ambient timezone. Only use the UTC getters/setters (getUTCDate,
// Date.UTC, etc.) after shifting by the fixed Lagos offset, so the result
// is identical no matter what timezone the Node process itself runs in.
//
// Nigeria has observed a single, unchanging UTC+1 offset (WAT) since 1919 —
// no DST — so a fixed-minute shift is correct and never needs a calendar
// rule, unlike most other "local time" problems.
export const BUSINESS_TIMEZONE = 'Africa/Lagos';
const LAGOS_OFFSET_MINUTES = 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** The real UTC instant shifted so UTC getters read as Lagos wall-clock time. */
function toLagosShifted(date: Date): Date {
  return new Date(date.getTime() + LAGOS_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** Lagos y/m/d/weekday for a given instant, read via UTC getters on the shifted instant (never local getters). */
export function businessDateParts(date: Date = new Date()): { year: number; month: number; day: number; weekday: number } {
  const shifted = toLagosShifted(date);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Midnight at the start of the Lagos-local calendar day containing `date`, as the real UTC instant it corresponds to. */
export function startOfBusinessDay(date: Date = new Date()): Date {
  const { year, month, day } = businessDateParts(date);
  return new Date(Date.UTC(year, month, day) - LAGOS_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** The last millisecond of the Lagos-local calendar day containing `date`. */
export function endOfBusinessDay(date: Date = new Date()): Date {
  return new Date(startOfBusinessDay(date).getTime() + MS_PER_DAY - 1);
}

/** 'yyyy-MM-dd' for the Lagos-local calendar day containing `date` — use this instead of `date.toISOString().split('T')[0]`. */
export function businessDateKey(date: Date = new Date()): string {
  const { year, month, day } = businessDateParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Monday as the Lagos-local weekday (0 = Sunday, like Date#getDay, but Lagos-anchored). */
export function isBusinessWeekday(date: Date): boolean {
  const { weekday } = businessDateParts(date);
  return weekday !== 0 && weekday !== 6;
}

/** Start of the Lagos-local week (Monday) containing `date`. */
export function startOfBusinessWeek(date: Date = new Date()): Date {
  const { year, month, day, weekday } = businessDateParts(date);
  const diff = day - weekday + (weekday === 0 ? -6 : 1); // Monday-start, matches the previous per-route logic
  return new Date(Date.UTC(year, month, diff) - LAGOS_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** End of the Lagos-local week (Sunday) containing `date`. */
export function endOfBusinessWeek(date: Date = new Date()): Date {
  return new Date(startOfBusinessWeek(date).getTime() + 7 * MS_PER_DAY - 1);
}

/** Start of the Lagos-local calendar month containing `date`. */
export function startOfBusinessMonth(date: Date = new Date()): Date {
  const { year, month } = businessDateParts(date);
  return new Date(Date.UTC(year, month, 1) - LAGOS_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** End of the Lagos-local calendar month containing `date`. */
export function endOfBusinessMonth(date: Date = new Date()): Date {
  const { year, month } = businessDateParts(date);
  return new Date(Date.UTC(year, month + 1, 1) - LAGOS_OFFSET_MINUTES * MS_PER_MINUTE - 1);
}

/** `date` shifted by `days` business-calendar days (Lagos-anchored), preserving the Lagos-local time of day. */
export function addBusinessDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}
