import { cpRoute } from "@/app/lib/candidate-portal/core";
import { getAlerts, saveAlerts } from "@/app/lib/candidate-portal/alerts";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
export async function GET(request: NextRequest) {
  return cpRoute(request, { auth: true }, (c) => getAlerts(c.account!));
}
// PUT { isActive, keywords[], location, remoteOnly, minSalary, frequency: INSTANT|DAILY|WEEKLY }
export async function PUT(request: NextRequest) {
  return cpRoute(request, { auth: true, json: true }, (c) =>
    saveAlerts(c.account!, c.body),
  );
}
