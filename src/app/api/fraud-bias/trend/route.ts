import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { fbRoute, EmptyReason } from "@/app/lib/fraud-bias";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/trend?companyId=&timeframe=LAST_12_MONTHS|<year>
// One point per month from the latest snapshot in that month. History starts at the first snapshot.
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const timeframe =
      new URL(request.url).searchParams.get("timeframe") || "LAST_12_MONTHS";
    const rows = await prisma.fairnessMetricSnapshot.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { capturedOn: "asc" },
      select: {
        capturedOn: true,
        appraisalFairness: true,
        promotionFairness: true,
        successionObjectivity: true,
      },
    });
    const years = [
      ...new Set(rows.map((r) => r.capturedOn.getUTCFullYear())),
    ].sort((a, b) => b - a);
    const isYear = /^\d{4}$/.test(timeframe);
    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - 11, 1);
    from.setUTCHours(0, 0, 0, 0);
    const inWindow = rows.filter((r) =>
      isYear
        ? r.capturedOn.getUTCFullYear() === Number(timeframe)
        : r.capturedOn >= from,
    );

    const months = new Map<string, (typeof rows)[number]>();
    for (const r of inWindow)
      months.set(
        `${r.capturedOn.getUTCFullYear()}-${String(r.capturedOn.getUTCMonth() + 1).padStart(2, "0")}`,
        r,
      );
    const points = [...months.entries()].map(([month, r]) => {
      const mon = r.capturedOn.toLocaleString("en", {
        month: "short",
        timeZone: "UTC",
      });
      return {
        month,
        label: isYear
          ? mon
          : `${mon} ${String(r.capturedOn.getUTCFullYear()).slice(2)}`,
        appraisal: r.appraisalFairness,
        promotion: r.promotionFairness,
        succession: r.successionObjectivity,
      };
    });
    const latest = (k: "appraisal" | "promotion" | "succession") =>
      [...points].reverse().find((p) => p[k] != null)?.[k] ?? null;
    return {
      points,
      years,
      timeframe,
      timeframes: [
        { value: "LAST_12_MONTHS", label: "Last 12 months" },
        ...years.map((y) => ({ value: String(y), label: String(y) })),
      ],
      latest: {
        appraisal: latest("appraisal"),
        promotion: latest("promotion"),
        succession: latest("succession"),
      },
      firstSnapshotOn: rows[0]?.capturedOn ?? null,
      emptyReason:
        points.length >= 2
          ? null
          : ({
              code: "INSUFFICIENT_HISTORY",
              message: rows.length
                ? "The trend needs snapshots from at least two different months. Daily snapshots are being collected."
                : "No snapshots yet. The first one is written when the dashboard is opened.",
            } as EmptyReason),
    };
  });
}
