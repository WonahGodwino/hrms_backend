import { cpRoute, Params } from "@/app/lib/candidate-portal/core";
import {
  downloadDocument,
  deleteDocument,
} from "@/app/lib/candidate-portal/profile";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// GET -> file bytes (attachment)
export async function GET(
  request: NextRequest,
  context: Params<{ id: string }>,
) {
  return cpRoute(request, { auth: true }, async (c) =>
    downloadDocument(c.account!.id, (await context.params).id),
  );
}
// DELETE -> refreshed documents payload
export async function DELETE(
  request: NextRequest,
  context: Params<{ id: string }>,
) {
  return cpRoute(request, { auth: true }, async (c) =>
    deleteDocument(c.account!.id, (await context.params).id),
  );
}
