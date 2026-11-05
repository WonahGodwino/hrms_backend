import path from "path";
import { stat, readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { withCors } from "@/app/lib/cors";
import { HttpError } from "./goal-utils";

export const UPLOAD_ROOT =
  process.env.GOAL_EVIDENCE_UPLOAD_DIR || "/var/app-uploads/goal-evidence";

export const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
  ".csv": "text/csv",
  ".txt": "text/plain",
};

// exactly what POST /api/goals/uploads produces
const URL_RE =
  /^\/goal-evidence\/([A-Za-z0-9_-]{1,64})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.[a-z0-9]{2,5})$/;

export function parseEvidenceUrl(fileUrl: string) {
  const m = URL_RE.exec(fileUrl);
  if (!m || !CONTENT_TYPES[m[3]]) return null;
  return { companyId: m[1], storedName: `${m[2]}${m[3]}`, ext: m[3] };
}

export function evidenceDiskPath(companyId: string, storedName: string) {
  const root = path.resolve(UPLOAD_ROOT);
  const full = path.resolve(root, companyId, storedName);
  if (!full.startsWith(root + path.sep))
    throw new HttpError(400, "Invalid file path");
  return full;
}

export async function assertUploadedFile(
  value: unknown,
  companyId: string,
): Promise<string> {
  const fileUrl = typeof value === "string" ? value.trim() : "";
  const parsed = parseEvidenceUrl(fileUrl);
  if (!parsed || parsed.companyId !== companyId)
    throw new HttpError(
      400,
      "fileUrl must come from the evidence upload endpoint",
    );
  try {
    await stat(evidenceDiskPath(parsed.companyId, parsed.storedName));
  } catch {
    throw new HttpError(
      400,
      "The uploaded file could not be found. Upload it again",
    );
  }
  return fileUrl;
}

export function sanitizeFileName(value: unknown): string {
  if (typeof value !== "string")
    throw new HttpError(400, "fileName must be a string");
  const name = path
    .basename(value)
    .replace(/[\u0000-\u001f\u007f\\/]/g, "_")
    .trim()
    .slice(0, 255);
  if (!name) throw new HttpError(400, "fileName is required");
  return name;
}

export async function readUploadedBuffer(
  fileUrl: string,
  expectedCompanyId?: string,
): Promise<{ buffer: Buffer; mimeType: string; sizeBytes: number } | null> {
  const parsed = parseEvidenceUrl(fileUrl);
  if (!parsed) return null;
  if (expectedCompanyId && parsed.companyId !== expectedCompanyId) return null;
  try {
    const full = evidenceDiskPath(parsed.companyId, parsed.storedName);
    const buffer = await readFile(full);
    const mimeType = CONTENT_TYPES[parsed.ext] || "application/octet-stream";
    return { buffer, mimeType, sizeBytes: buffer.length };
  } catch {
    return null;
  }
}

export function serveBinaryFile({
  buffer,
  mimeType,
  fileName,
  disposition = "attachment",
  origin,
}: {
  buffer: Buffer;
  mimeType: string | null;
  fileName: string;
  disposition?: "inline" | "attachment";
  origin: string | null;
}) {
  const contentType = mimeType || "application/octet-stream";
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return withCors(
    new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    }),
    origin,
  );
}
