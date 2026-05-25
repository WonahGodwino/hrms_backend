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
  title: string;
  description: string;
  department: string;
  position: string;
  employmentType?: string;
  workplaceType?: string;
  experienceLevel?: string;
  salaryRange?: string;
  benefits?: string[];
  locations?: { state: string; lga: string }[];
  expirationDate: Date | null;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "EXPIRED" | null;
};

const normalizeHeader = (h: string) =>
  h
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
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

function parseBenefits(raw: unknown): string[] {
  if (!raw) return [];
  const str = String(raw).trim();
  if (!str) return [];
  return str.split(',').map(b => b.trim()).filter(b => b);
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

  const title = getStringValue(row, ["title", "job title", "job_title"]);
  const description = getStringValue(row, ["description", "job description", "job_description"]);
  const department = getStringValue(row, ["department", "dept"]);
  const position = getStringValue(row, ["position", "role"]);

  if (!title) rowErrors.push("Missing title");
  if (!description) rowErrors.push("Missing description");
  if (!department) rowErrors.push("Missing department");
  if (!position) rowErrors.push("Missing position");

  const employmentType = getStringValue(row, ["employmentType", "employment_type", "employment type"]);
  const workplaceType = getStringValue(row, ["workplaceType", "workplace_type", "workplace type"]);
  const experienceLevel = getStringValue(row, ["experienceLevel", "experience_level", "experience level"]);
  const salaryRange = getStringValue(row, ["salaryRange", "salary_range", "salary range"]);
  
  const benefitsRaw = row["benefits"];
  const locationsRaw = row["locations"];
  
  const benefits = parseBenefits(benefitsRaw);
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
      title: title!,
      description: description!,
      department: department!,
      position: position!,
      employmentType: employmentType || undefined,
      workplaceType: workplaceType || undefined,
      experienceLevel: experienceLevel || undefined,
      salaryRange: salaryRange || undefined,
      benefits: benefits.length > 0 ? benefits : undefined,
      locations: locations.length > 0 ? locations : undefined,
      expirationDate: expirationDate ?? null,
      status: status ?? null,
    }
  };
}

async function isLikelyDuplicate(companyId: string, item: ValidatedJobRow) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const existing = await prisma.job.findFirst({
    where: {
      companyId,
      title: item.title,
      department: item.department,
      position: item.position,
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
      }
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
        const csvText = buffer.toString("utf-8");
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
        if (!lines.length) throw new Error("Empty CSV file");

        const headersRaw = splitCsvLine(lines[0]);
        const headers = headersRaw.map(normalizeHeader);

        for (let i = 1; i < lines.length; i++) {
          const values = splitCsvLine(lines[i]);
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

    const results = {
      totalRows: data.length,
      successful: 0,
      failed: 0,
      skippedDuplicates: 0,
      errors: [] as string[],
    };

    for (let index = 0; index < data.length; index++) {
      const row = data[index];
      const displayRow = index + 2;

      const validated = validateRow(row);
      if (!validated.ok) {
        results.failed++;
        results.errors.push(`Row ${displayRow}: ${validated.errors.join("; ")}`);
        continue;
      }

      const jobData = validated.data;

      try {
        const duplicate = await isLikelyDuplicate(companyId!, jobData);
        if (duplicate) {
          results.skippedDuplicates++;
          continue;
        }

        const createData: any = {
          title: jobData.title,
          description: jobData.description,
          department: jobData.department,
          position: jobData.position,
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
        if (jobData.benefits && jobData.benefits.length > 0) {
          createData.benefits = JSON.parse(JSON.stringify(jobData.benefits));
        }
        if (jobData.locations && jobData.locations.length > 0) {
          createData.locations = JSON.parse(JSON.stringify(jobData.locations));
        }

        await prisma.job.create({ data: createData });
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${displayRow}: ${formatError(error)}`);
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