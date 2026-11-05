import { cpRoute, Params } from "@/app/lib/candidate-portal/core";
import {
  updateEducation,
  deleteEducation,
} from "@/app/lib/candidate-portal/profile";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
export async function PUT(
  request: NextRequest,
  context: Params<{ id: string }>,
) {
  return cpRoute(request, { auth: true, json: true }, async (c) =>
    updateEducation(c.account!.id, (await context.params).id, c.body),
  );
}
export async function DELETE(
  request: NextRequest,
  context: Params<{ id: string }>,
) {
  return cpRoute(request, { auth: true }, async (c) =>
    deleteEducation(c.account!.id, (await context.params).id),
  );
}
