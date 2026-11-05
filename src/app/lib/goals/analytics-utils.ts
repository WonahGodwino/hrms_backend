/**
 * Builds N trailing month buckets ending with the current month, each with a
 * label (e.g. "Jan") and a [start, end) date range for querying.
 */
export function buildMonthBuckets(months: number) {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    buckets.push({
      label: start.toLocaleString("en-US", { month: "short" }),
      start,
      end,
    });
  }
  return buckets;
}

export function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}
