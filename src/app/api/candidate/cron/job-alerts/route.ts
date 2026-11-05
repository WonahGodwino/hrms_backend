import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { runJobAlerts } from "@/app/lib/candidate-portal/alerts";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST, secured with CRON_SECRET. Schedule about every 15 minutes.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return withCors(
      NextResponse.json(
        { success: false, message: "CRON_SECRET is not configured." },
        { status: 503 },
      ),
      origin,
    );
  const m = /^Bearer\s+(.+)$/i.exec(
    (request.headers.get("authorization") || "").trim(),
  );
  const a = Buffer.from(m ? m[1] : "", "utf-8");
  const b = Buffer.from(secret, "utf-8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return withCors(
      NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      ),
      origin,
    );
  const result = await runJobAlerts();
  return withCors(NextResponse.json({ success: true, data: result }), origin);
}
