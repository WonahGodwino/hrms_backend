import { cpRoute, CpResult } from "@/app/lib/candidate-portal/core";
import {
  listDocuments,
  uploadDocument,
} from "@/app/lib/candidate-portal/profile";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// GET -> { resume, supporting[], quota: { used, max: 3, remaining } }
export async function GET(request: NextRequest) {
  return cpRoute(request, { auth: true }, (c) => listDocuments(c.account!.id));
}
// POST multipart: file, category (RESUME replaces the resume; others count toward the limit of 3)
export async function POST(request: NextRequest) {
  return cpRoute(
    request,
    { auth: true },
    async (c) =>
      new CpResult(
        await uploadDocument(c.account!.id, await c.request.formData()),
        "Document uploaded",
        201,
      ),
  );
}
