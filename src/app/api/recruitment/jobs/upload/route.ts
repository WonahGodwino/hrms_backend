// src/app/api/recruitment/jobs/upload/route.ts
import { assertTrialCapacity } from '@/app/lib/trial/guard'
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireModuleAccess } from "@/app/lib/module-access";
import { ApiResponse, formatError } from "@/app/lib/utils";
import ExcelJS from "exceljs";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { forCompany } from "@/app/lib/data/tenant";
import { normalizeHeader, parseCsv, plainTextToHtml, getStringValue, validateRow, isLikelyDuplicate, type RawRow } from "@/app/lib/recruitment/jobs-upload-helpers";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}






// Proper CSV parser: tokenises the whole document so quoted fields may contain
// commas AND embedded newlines (e.g. multi-line job descriptions). Handles








// True when the text contains a recognised HTML tag (not just a stray "<"/">"






// Flattens arbitrary HTML into plain text, preserving structure as newlines and
// "- " bullets. Used to neutralise any HTML an author pasted into the sheet:
// the flattened text is then rebuilt into HTML from our own escaped tags, so no


// Converts a plain-text job description into safe HTML so bulk-imported jobs
// render with the same formatting as ones built in the form. Blank lines break
// paragraphs; lines starting with -, * or • become bullet list items. If the
// author pasted HTML, it is flattened to text first — the output is ALWAYS








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
        const hasAccess = await forCompany(selectedCompanyId).userCompany.findFirst({
          where: {
            userId: user.userId,
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
      forCompany(companyId!).designation.findMany({
        select: { id: true, title: true, code: true },
      }),
      forCompany(companyId!).department.findMany({
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
      salary: getStringValue(row, ["salary", "salaryRange", "salary_range", "salary range"]) || "",
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
        if (jobData.salary !== undefined) createData.salary = jobData.salary;
        if (jobData.locations && jobData.locations.length > 0) {
          createData.locations = JSON.parse(JSON.stringify(jobData.locations));
        }

        await assertTrialCapacity(companyId, 'openJobs');
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