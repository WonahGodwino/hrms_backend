const DAY_MS = 86_400_000;
const OFFSET_MIN = Number(process.env.APPRAISAL_UTC_OFFSET_MINUTES ?? 0) || 0;

// Cycle dates and deadlines are calendar dates stored at UTC midnight. A deadline is overdue only
// once the calendar date in the company's timezone is AFTER it.
export function todayStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + OFFSET_MIN * 60_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}
export const todayKey = (now?: Date) =>
  todayStart(now).toISOString().slice(0, 10);
export const isPastDate = (d: Date | null | undefined, now?: Date) =>
  !!d && d.getTime() < todayStart(now).getTime();
export const daysUntilDate = (d: Date, now?: Date) =>
  Math.round(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      todayStart(now).getTime()) /
      DAY_MS,
  );

export const localNowMs = (now: Date = new Date()) =>
  now.getTime() + OFFSET_MIN * 60_000;
// A deadline is a calendar date stored at UTC midnight; it ends when that day ends.
export const deadlineEndMs = (d: Date) => d.getTime() + DAY_MS;