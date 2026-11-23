// Helpers for app/api/recruitment/jobs/upload/route.ts (CODE-004: moved out of the route file).
import { parseSalaryAmount } from '@/app/lib/recruitment/job-salary'
import { forCompany } from '@/app/lib/data/tenant'

export type RawRow = Record<string, unknown>;

export const normalizeHeader = (h: string) =>
  h
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

// escaped quotes ("") and both \r\n and \n record separators.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\r") {
      // ignore; handled by the \n case
    } else if (ch === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush the final field/row.
  row.push(field.trim());
  rows.push(row);

  return rows;
}

export function parseExpirationDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }
  if (typeof raw === "number") {
    const excelBase = new Date(1899, 11, 30);
    const millis = raw * 24 * 60 * 60 * 1000;
    const parsed = new Date(excelBase.getTime() + millis);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }
  return null;
}

export function parseJobStatus(raw: unknown): "DRAFT" | "ACTIVE" | "CLOSED" | "EXPIRED" | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "DRAFT" || s === "ACTIVE" || s === "CLOSED" || s === "EXPIRED") return s;
  return null;
}

// "State:LGA" or "State:LGA:City", comma-separated (same fields as the job form).
export function parseLocations(raw: unknown): { state: string; lga: string; city?: string }[] {
  if (!raw) return [];
  const str = String(raw).trim();
  if (!str) return [];

  return str.split(',').map(loc => {
    const parts = loc.split(':');
    if (parts.length === 2 || parts.length === 3) {
      const city = (parts[2] || '').trim();
      return { state: parts[0].trim(), lga: parts[1].trim(), ...(city ? { city } : {}) };
    }
    return null;
  }).filter(loc => loc !== null) as { state: string; lga: string; city?: string }[];
}

// used as a comparison operator in plain text).
export function looksLikeHtml(s: string): boolean {
  return /<\/?(p|div|br|span|ul|ol|li|h[1-6]|strong|em|b|i|u|a|table|thead|tbody|tr|td|th|section|article|header|footer|blockquote|pre|code)\b[^>]*>/i.test(s);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

// author-supplied markup (scripts, event handlers, etc.) can ever be rendered.
export function htmlToPlainText(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*li[^>]*>/gi, "\n- ")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol|li|section|article|header|footer|tr|table)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// rebuilt from our own escaped tags, so raw markup is never rendered.
export function plainTextToHtml(input: string): string {
  let text = String(input || "").trim();
  if (!text) return "";
  if (looksLikeHtml(text)) text = htmlToPlainText(text);
  if (!text) return "";

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      html.push("<ul>" + listBuffer.map((li) => `<li>${li}</li>`).join("") + "</ul>");
      listBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      listBuffer.push(escapeHtml(bullet[1].trim()));
    } else {
      flushList();
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushList();
  return html.join("");
}

export function getStringValue(row: RawRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== "") {
      if (typeof value === "string") return value.trim() || null;
      return String(value).trim() || null;
    }
  }
  return null;
}

export function validateRow(row: RawRow) {
  const rowErrors: string[] = [];

  const designation = getStringValue(row, ["designation", "designation title", "designation_title", "designationtitle", "designation code", "designation_code"]);
  const title = getStringValue(row, ["title", "job title", "job_title"]);
  const description = getStringValue(row, ["description", "job description", "job_description"]);
  const department = getStringValue(row, ["department", "dept"]);

  if (!designation) rowErrors.push("Missing designation");
  if (!description) rowErrors.push("Missing description");
  if (!department) rowErrors.push("Missing department");

  const employmentType = getStringValue(row, ["employmentType", "employment_type", "employment type"]);
  const workplaceType = getStringValue(row, ["workplaceType", "workplace_type", "workplace type"]);
  const experienceLevel = getStringValue(row, ["experienceLevel", "experience_level", "experience level"]);
  // Single numeric salary in the company's base currency (no ranges), same as
  // the job form. Legacy "salaryRange" headers are still read but must be one figure.
  const salaryRaw = getStringValue(row, ["salary", "salaryRange", "salary_range", "salary range"]);
  const salary = salaryRaw ? parseSalaryAmount(salaryRaw) : null;
  if (salaryRaw && salary === null) {
    rowErrors.push("Invalid salary (enter one numeric amount, e.g. 500000 — ranges are not allowed)");
  }

  const locationsRaw = row["locations"];

  const locations = parseLocations(locationsRaw);

  const expirationRaw = row["expirationDate"] ?? row["expiration date"] ?? row["expirationdate"];
  const expirationDate = parseExpirationDate(expirationRaw);
  if (expirationRaw != null && String(expirationRaw).trim() !== "" && !expirationDate) {
    rowErrors.push("Invalid expirationDate (expected a valid date, YYYY-MM-DD)");
  }

  const statusRaw = row["status"];
  const status = parseJobStatus(statusRaw);
  if (statusRaw != null && String(statusRaw).trim() !== "" && !status) {
    rowErrors.push("Invalid status (use DRAFT, ACTIVE, CLOSED, EXPIRED)");
  }

  if (rowErrors.length) {
    return { ok: false as const, errors: rowErrors };
  }

  return {
    ok: true as const,
    data: {
      designation: designation!,
      title: title || undefined,
      description: description!,
      department: department!,
      employmentType: employmentType || undefined,
      workplaceType: workplaceType || undefined,
      experienceLevel: experienceLevel || undefined,
      salary: salary ?? undefined,
      locations: locations.length > 0 ? locations : undefined,
      expirationDate: expirationDate ?? null,
      status: status ?? null,
    }
  };
}

export async function isLikelyDuplicate(companyId: string, title: string, department: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const existing = await forCompany(companyId).job.findFirst({
    where: {
      title,
      department,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(existing);
}
