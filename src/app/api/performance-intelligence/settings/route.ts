import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import prisma from "@/app/lib/prisma";
import {
  authorizeSuper,
  getSettings,
  DEFAULT_LEADERSHIP_WEIGHTS,
} from "@/app/lib/performance-intelligence/intel-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorizeSuper(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    return withCors(
      ApiResponse.success(
        {
          ...(await getSettings(a.auth.companyId)),
          defaultWeights: DEFAULT_LEADERSHIP_WEIGHTS,
        },
        "Settings retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PATCH body: { companyId, strategicTargetScore?, minGroupSize?, chronicLowCycles?,
//               reportRetentionDays?, leadershipWeights? }
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  const bad = (m: string) => withCors(ApiResponse.error(m, 400), origin);
  try {
    const body = await request.json();
    const a = await authorizeSuper(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const data: Record<string, unknown> = {};
    const int = (key: string, min: number, max: number) => {
      if (body[key] === undefined) return null;
      if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max)
        return `${key} must be an integer between ${min} and ${max}`;
      data[key] = body[key];
      return null;
    };
    const err =
      int("strategicTargetScore", 1, 100) ??
      int("minGroupSize", 1, 50) ??
      int("chronicLowCycles", 1, 6) ??
      int("reportRetentionDays", 7, 365);
    if (err) return bad(err);

    if (body.leadershipWeights !== undefined) {
      const w = body.leadershipWeights as Record<string, unknown>;
      const keys = Object.keys(DEFAULT_LEADERSHIP_WEIGHTS);
      const ok =
        w &&
        keys.every((k) => Number.isInteger(w[k]) && (w[k] as number) >= 0) &&
        keys.reduce((s, k) => s + (w[k] as number), 0) === 100;
      if (!ok)
        return bad(
          "leadershipWeights needs integer values for " +
            keys.join(", ") +
            " that add up to 100",
        );
      data.leadershipWeights = w;
    }
    if (!Object.keys(data).length) return bad("Nothing to update");

    const previous = await getSettings(companyId);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.intelligenceSettings.update({
        where: { companyId },
        data: { ...data, updatedById: actorId },
      });
      await tx.intelligenceSettingsHistory.create({
        data: {
          settingsId: updated.id,
          companyId,
          action: "UPDATED",
          actorId,
          previousData: JSON.parse(JSON.stringify(previous)),
          newData: JSON.parse(JSON.stringify(data)),
        },
      });
      return updated;
    });
    void row;
    return withCors(
      ApiResponse.success(
        await getSettings(companyId),
        "Settings updated successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}