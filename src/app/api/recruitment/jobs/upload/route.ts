// src/app/api/recruitment/jobs/upload/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { requireModuleAccess } from "@/app/lib/module-access";
import { ApiResponse, formatError } from "@/app/lib/utils";
import ExcelJS from "exceljs";
import { handleCorsOptions, withCors } from "@/app/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type RawRow = Record<string, unknown>;

type ValidatedJobRow = {
  designation: string; // designation title or code from the sheet
  title?: string; // optional — defaults to the designation title
  description: string;
  department: string;
  employmentType?: string;
  workplaceType?: string;
  experienceLevel?: string;
  salaryRange?: string;
  locations?: { state: string; lga: string }[];
  expirationDate: Date | null;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "EXPIRED" | null;
};

const normalizeHeader = (h: string) =>
  h
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

// Proper CSV parser: tokenises the whole document so quoted fields may contain
// commas AND embedded newlines (e.g. multi-line job descriptions). Handles
// escaped quotes ("") and both \r\n and \n record separators.
function parseCsv(text: string): string[][] {
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

function parseExpirationDate(raw: unknown): Date | null {
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

function parseJobStatus(raw: unknown): "DRAFT" | "ACTIVE" | "CLOSED" | "EXPIRED" | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "DRAFT" || s === "ACTIVE" || s === "CLOSED" || s === "EXPIRED") return s;
  return null;
}

function parseLocations(raw: unknown): { state: string; lga: string }[] {
  if (!raw) return [];
  const str = String(raw).trim();
  if (!str) return [];
  
  return str.split(',').map(loc => {
    const parts = loc.split(':');
    if (parts.length === 2) {
      return { state: parts[0].trim(), lga: parts[1].trim() };
    }
    return null;
  }).filter(loc => loc !== null) as { state: string; lga: string }[];
}

// True when the text contains a recognised HTML tag (not just a stray "<"/">"
// used as a comparison operator in plain text).
function looksLikeHtml(s: string): boolean {
  return /<\/?(p|div|br|span|ul|ol|li|h[1-6]|strong|em|b|i|u|a|table|thead|tbody|tr|td|th|section|article|header|footer|blockquote|pre|code)\b[^>]*>/i.test(s);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

// Flattens arbitrary HTML into plain text, preserving structure as newlines and
// "- " bullets. Used to neutralise any HTML an author pasted into the sheet:
// the flattened text is then rebuilt into HTML from our own escaped tags, so no
// author-supplied markup (scripts, event handlers, etc.) can ever be rendered.
function htmlToPlainText(html: string): string {
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

// Converts a plain-text job description into safe HTML so bulk-imported jobs
// render with the same formatting as ones built in the form. Blank lines break
// paragraphs; lines starting with -, * or • become bullet list items. If the
// author pasted HTML, it is flattened to text first — the output is ALWAYS
// rebuilt from our own escaped tags, so raw markup is never rendered.
function plainTextToHtml(input: string): string {
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

function getStringValue(row: RawRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== "") {
      if (typeof value === "string") return value.trim() || null;
      return String(value).trim() || null;
    }
  }
  return null;
}

function validateRow(row: RawRow) {
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
  const salaryRange = getStringValue(row, ["salaryRange", "salary_range", "salary range"]);
  
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
      salaryRange: salaryRange || undefined,
      locations: locations.length > 0 ? locations : undefined,
      expirationDate: expirationDate ?? null,
      status: status ?? null,
    }
  };
}

async function isLikelyDuplicate(companyId: string, title: string, department: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const existing = await prisma.job.findFirst({
    where: {
      companyId,
      title,
      department,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return withCors(ApiResponse.error("Authorization header missing", 401), origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const user = await requireModuleAccess(token, 'RECRUITMENT', ["HR", "SUPER_ADMIN", "ADMIN"]);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    let companyId: string | null = null;

    if (user.role === "HR") {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error("Company context missing for HR user", 400),
          origin
        );
      }
      companyId = user.companyId;
    } else if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
      const selectedCompanyId = formData.get("companyId") as string | null;
      
      if (!selectedCompanyId) {
        return withCors(
          ApiResponse.error("Company selection is required for administrators", 400),
          origin
        );
      }
      companyId = selectedCompanyId;

      if (user.role === "ADMIN") {
        const hasAccess = await prisma.userCompany.findFirst({
          where: {
            userId: user.userId,
            companyId: selectedCompanyId,
            role: { in: ["ADMIN", "ALL"] }
          }
        });

        if (!hasAccess) {
          return withCors(
            ApiResponse.error("You do not have access to upload jobs for this company", 403),
            origin
          );
        }
      }
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error("Company context is missing", 400),
        origin
      );
    }

    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        archived: 0
      },
      select: { id: true, companyName: true }
    });

    if (!company) {
      return withCors(
        ApiResponse.error("Company not found or is archived", 404),
        origin
      );
    }

    if (!file) {
      return withCors(ApiResponse.error("No file uploaded", 400), origin);
    }

    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const isExcel = fileExtension === "xlsx" || fileExtension === "xls";
    const isCsv = fileExtension === "csv" || file.type === "text/csv";

    if (!isExcel && !isCsv) {
      return withCors(
        ApiResponse.error("Invalid file format. Upload Excel (.xlsx/.xls) or CSV (.csv).", 400),
        origin
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const data: RawRow[] = [];

    try {
      const workbook = new ExcelJS.Workbook();

      if (isCsv) {
        // Strip a leading UTF-8 BOM (common in Excel-exported CSVs).
        let csvText = buffer.toString("utf-8");
        if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
        const records = parseCsv(csvText).filter((r) =>
          r.some((c) => c.trim() !== "")
        );
        if (!records.length) throw new Error("Empty CSV file");

        const headers = records[0].map(normalizeHeader);

        for (let i = 1; i < records.length; i++) {
          const values = records[i];
          const rowData: RawRow = {};
          headers.forEach((h, idx) => (rowData[h] = values[idx] ?? ""));
          data.push(rowData);
        }
      } else {
        await workbook.xlsx.load(bytes as ArrayBuffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error("No worksheet found");

        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber - 1] = normalizeHeader(cell.value?.toString() ?? `col${colNumber}`);
        });

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 1) return;
          const rowData: RawRow = {};
          let hasData = false;
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1];
            const value = cell.value;
            if (value !== null && value !== undefined && value !== "") hasData = true;
            rowData[header] = value;
          });
          if (hasData) data.push(rowData);
        });
      }
    } catch {
      return withCors(
        ApiResponse.error("Failed to parse file. Check the format and headers.", 400),
        origin
      );
    }

    if (!data.length) {
      return withCors(ApiResponse.error("No job data found in the file", 400), origin);
    }

    // Preload this company's designations and departments so each row can be
    // resolved against Core Setup — designation + department linking is required
    // for imported jobs.
    const [companyDesignations, companyDepartments] = await Promise.all([
      (prisma as any).designation.findMany({
        where: { companyId: companyId! },
        select: { id: true, title: true, code: true },
      }),
      prisma.department.findMany({
        where: { companyId: companyId! },
        select: { id: true, name: true },
      }),
    ]);
    const designationByKey = new Map<string, { id: string; title: string }>();
    for (const d of companyDesignations as Array<{ id: string; title: string; code: string | null }>) {
      if (d.title) designationByKey.set(d.title.trim().toLowerCase(), { id: d.id, title: d.title });
      if (d.code) designationByKey.set(d.code.trim().toLowerCase(), { id: d.id, title: d.title });
    }
    const departmentByKey = new Map<string, { id: string; name: string }>();
    for (const d of companyDepartments) {
      departmentByKey.set(d.name.trim().toLowerCase(), { id: d.id, name: d.name });
    }

    const results = {
      totalRows: data.length,
      successful: 0,
      failed: 0,
      skippedDuplicates: 0,
      errors: [] as string[],
    };

    // Structured record of every failed row (original columns + reason) so the
    // frontend can offer a downloadable "fix and re-upload" sheet.
    const failedRows: Array<Record<string, string | number>> = [];
    const rowColumns = (row: RawRow) => ({
      designation: getStringValue(row, ["designation", "designation title", "designation_title", "designationtitle", "designation code", "designation_code"]) || "",
      title: getStringValue(row, ["title", "job title", "job_title"]) || "",
      description: getStringValue(row, ["description", "job description", "job_description"]) || "",
      department: getStringValue(row, ["department", "dept"]) || "",
      employmentType: getStringValue(row, ["employmentType", "employment_type", "employment type"]) || "",
      workplaceType: getStringValue(row, ["workplaceType", "workplace_type", "workplace type"]) || "",
      experienceLevel: getStringValue(row, ["experienceLevel", "experience_level", "experience level"]) || "",
      salaryRange: getStringValue(row, ["salaryRange", "salary_range", "salary range"]) || "",
      locations: row["locations"] == null ? "" : String(row["locations"]),
      expirationDate: String(row["expirationDate"] ?? row["expiration date"] ?? row["expirationdate"] ?? ""),
      status: row["status"] == null ? "" : String(row["status"]),
    });
    const fail = (displayRow: number, row: RawRow, msg: string) => {
      results.failed++;
      results.errors.push(`Row ${displayRow}: ${msg}`);
      failedRows.push({ row: displayRow, errors: msg, ...rowColumns(row) });
    };

    for (let index = 0; index < data.length; index++) {
      const row = data[index];
      const displayRow = index + 2;

      const validated = validateRow(row);
      if (!validated.ok) {
        fail(displayRow, row, validated.errors.join("; "));
        continue;
      }

      const jobData = validated.data;

      // Designation is required and must exist in Core Setup (match by title or code).
      const designation = designationByKey.get(jobData.designation.trim().toLowerCase());
      if (!designation) {
        fail(displayRow, row, `Designation "${jobData.designation}" was not found. Create it in Core Setup → Designations first.`);
        continue;
      }

      // Department is required and must exist in Core Setup.
      const dept = departmentByKey.get(jobData.department.trim().toLowerCase());
      if (!dept) {
        fail(displayRow, row, `Department "${jobData.department}" was not found. Create it in Core Setup → Departments first.`);
        continue;
      }

      // Title is optional — default to the designation name; position mirrors title.
      const resolvedTitle = (jobData.title || designation.title).trim();

      try {
        const duplicate = await isLikelyDuplicate(companyId!, resolvedTitle, dept.name);
        if (duplicate) {
          results.skippedDuplicates++;
          continue;
        }

        const createData: any = {
          designationId: designation.id,
          departmentId: dept.id,
          title: resolvedTitle,
          // Store as HTML so imported jobs render like form-built ones. Authors
          // supply plain text in the template; formatting is applied here.
          description: plainTextToHtml(jobData.description),
          department: dept.name,
          position: resolvedTitle,
          companyId: companyId!,
          expirationDate: jobData.expirationDate,
          status: (jobData.status ?? "ACTIVE") as any,
          createdBy: user.userId,
          updatedBy: user.userId,
        };

        if (jobData.employmentType) createData.employmentType = jobData.employmentType;
        if (jobData.workplaceType) createData.workplaceType = jobData.workplaceType;
        if (jobData.experienceLevel) createData.experienceLevel = jobData.experienceLevel;
        if (jobData.salaryRange) createData.salaryRange = jobData.salaryRange;
        if (jobData.locations && jobData.locations.length > 0) {
          createData.locations = JSON.parse(JSON.stringify(jobData.locations));
        }

        await prisma.job.create({ data: createData });
        results.successful++;
      } catch (error) {
        fail(displayRow, row, formatError(error));
      }
    }

    console.log(`[JOB_BULK_UPLOAD] Jobs uploaded for company ${companyId} (${company.companyName}) by ${user.role}:${user.email}`);
    console.log(`[JOB_BULK_UPLOAD] Summary: ${results.successful} successful, ${results.failed} failed, ${results.skippedDuplicates} skipped duplicates`);

    return withCors(
      ApiResponse.success(
        {
          summary: {
            total: results.totalRows,
            successful: results.successful,
            failed: results.failed,
            skippedDuplicates: results.skippedDuplicates,
            userRole: user.role,
            companyId: companyId,
            companyName: company.companyName
          },
          errors: results.errors,
          // Structured failed rows for the downloadable correction sheet.
          failedRows,
          // Imported jobs start with no benefits linked. Benefits are managed per
          // designation/job in the Loans & Benefits module — remind the importer.
          benefitsReminder: results.successful > 0
            ? `${results.successful} job(s) imported without benefits. Link benefits for each designation/job in the Loans & Benefits module.`
            : null,
        },
        "Jobs postings processed Successfully"
      ),
      origin
    );
  } catch (error) {
    console.error("[JOB_BULK_UPLOAD] Error:", error);
    return withCors(ApiResponse.error(formatError(error), 500), request.headers.get("origin"));
  }
}