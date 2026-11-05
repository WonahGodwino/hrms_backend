import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { isExecutorEnabled } from "@/app/lib/automation-config";
import {
  MAX_COMPANIES_PER_EXTERNAL_TICK,
  RUN_BUDGET_MS,
} from "@/app/lib/automation-executor";
import { maybeSweep } from "@/app/lib/automation-scheduled";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/automation/external-tick
// Optional hook for external cron pingers. Secured via CRON_SECRET.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return withCors(
      NextResponse.json(
        { success: false, message: "CRON_SECRET is not configured on the server." },
        { status: 503 },
      ),
      origin,
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = match ? match[1] : "";

  // Constant-time string comparison
  const tokenBuf = Buffer.from(token, "utf-8");
  const secretBuf = Buffer.from(cronSecret, "utf-8");
  const isValid =
    tokenBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(tokenBuf, secretBuf);

  if (!isValid) {
    return withCors(
      NextResponse.json(
        { success: false, message: "Unauthorized: Invalid token." },
        { status: 401 },
      ),
      origin,
    );
  }

  if (!isExecutorEnabled()) {
    return withCors(
      NextResponse.json(
        { success: false, message: "The automation executor is turned off." },
        { status: 409 },
      ),
      origin,
    );
  }

  const startTime = Date.now();

  // Find companies with at least one ACTIVE non-removed rule
  const activeCompanies = await prisma.automationRule.findMany({
    where: { status: "ACTIVE", removedAt: null },
    distinct: ["companyId"],
    select: { companyId: true },
  });

  const companyIds = activeCompanies.map((c) => c.companyId);
  if (companyIds.length === 0) {
    return withCors(
      NextResponse.json({
        success: true,
        message: "No companies with active automation rules.",
        swept: [],
      }),
      origin,
    );
  }

  // Find latest tick for each company to sort least recently swept first
  const latestTicks = await prisma.automationExecutorTick.findMany({
    where: {
      companyId: { in: companyIds },
      status: { in: ["OK", "PARTIAL"] },
      finishedAt: { not: null },
    },
    orderBy: { finishedAt: "desc" },
    select: { companyId: true, finishedAt: true },
  });

  const lastSweepMap = new Map<string, number>();
  for (const t of latestTicks) {
    if (!lastSweepMap.has(t.companyId) && t.finishedAt) {
      lastSweepMap.set(t.companyId, t.finishedAt.getTime());
    }
  }

  // Sort: null/never swept first, then oldest finishedAt
  const sortedCompanyIds = [...companyIds].sort((a, b) => {
    const at = lastSweepMap.get(a) ?? 0;
    const bt = lastSweepMap.get(b) ?? 0;
    return at - bt;
  });

  const targets = sortedCompanyIds.slice(0, MAX_COMPANIES_PER_EXTERNAL_TICK);
  const swept: Array<{
    companyId: string;
    throttled: boolean;
    eventsEmitted: number;
    eventsProcessed: number;
    runsCreated: number;
  }> = [];

  for (const companyId of targets) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= RUN_BUDGET_MS) {
      break;
    }

    const remainingBudget = Math.max(1000, RUN_BUDGET_MS - elapsed);
    const res = await maybeSweep(companyId, "EXTERNAL", {
      budgetMs: remainingBudget,
    });

    swept.push({
      companyId,
      throttled: res.throttled,
      eventsEmitted: res.eventsEmitted,
      eventsProcessed: res.eventsProcessed,
      runsCreated: res.runsCreated,
    });
  }

  return withCors(
    NextResponse.json({
      success: true,
      message: `External tick completed. Swept ${swept.length} companies.`,
      swept,
    }),
    origin,
  );
}
