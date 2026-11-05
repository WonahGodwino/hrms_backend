// A job carries a single numeric salary (`Job.salary`) in the owning company's
// base currency. Jobs created before that column existed may only have the
// legacy free-text `salaryRange` (e.g. "N500,000 - N800,000"), which is used as
// a read-only fallback.

export const DEFAULT_JOB_CURRENCY = "NGN";

type SalaryInput = { salary?: unknown; salaryRange?: string | null };

/** Parses a salary made only of digits / separators into a number. */
export function parseSalaryAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const cleaned = String(raw).replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Numeric salary of a job, or null when none is set. */
export function jobSalaryAmount(job: SalaryInput): number | null {
  if (job.salary !== null && job.salary !== undefined) {
    const n = Number(job.salary);
    if (Number.isFinite(n)) return n;
  }
  return parseSalaryAmount(job.salaryRange);
}

/** Display string for a job's salary, e.g. "₦500,000". Null when unset. */
export function formatJobSalary(job: SalaryInput, currency?: string | null): string | null {
  const amount = jobSalaryAmount(job);
  if (amount === null) {
    const legacy = String(job.salaryRange ?? "").trim();
    return legacy || null; // legacy free-text range
  }
  const code = (currency || DEFAULT_JOB_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat(code === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en")}`;
  }
}
