import { assertTrialCapacity } from '@/app/lib/trial/guard'
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logRecordChange } from '@/app/lib/core-setup/audit'
import { normalizeFrequency } from '@/app/lib/designations/helpers'
import { decimalOrNull } from '@/app/lib/prisma-utils'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const token =
      req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    if (!token)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user = await getUserFromToken(token);
    if (!user || !["ADMIN", "HR", "SUPER_ADMIN"].includes(user.role))
      return withCors(ApiResponse.error("Unauthorized", 403), origin);

    const body = await req.json();
    const {
      title,
      code,
      description,
      basePay,
      basePayFrequency,
      benefits,
      departmentId,
    } = body;
    if (!title || !code)
      return withCors(
        ApiResponse.error("title and code are required", 400),
        origin,
      );

    // Resolve companyId from the global selector (body) first, then fall back
    // to the value stored in the JWT at login time.
    const companyId = body.companyId || user.companyId;

    if (!companyId) {
      return withCors(ApiResponse.error("Company ID is required", 400), origin);
    }
    if (user.companyIds && !user.companyIds.includes(companyId)) {
      return withCors(
        ApiResponse.error(
          "You do not have access to the selected company",
          403,
        ),
        origin,
      );
    }

    const existing = await prisma.designation.findFirst({
      where: { code, companyId },
    });
    if (existing)
      return withCors(
        ApiResponse.error(`Code "${code}" already exists`, 409),
        origin,
      );

    await assertTrialCapacity(companyId, 'designations')
    const designation = await prisma.designation.create({
      data: {
        companyId,
        title,
        code,
        departmentId: departmentId || null,
        basePay: basePay != null && basePay !== "" ? Number(basePay) : null,
        basePayFrequency: normalizeFrequency(basePayFrequency),
        benefits: benefits ?? undefined,
        description: description || "",
        status: "Active",
      },
    })

    await logRecordChange(req, user, { companyId, noun: 'Designation', type: 'designation', after: { id: designation.id, title: designation.title, code: designation.code, status: designation.status } })

    return withCors(
      ApiResponse.success(
        {
          id: designation.id,
          title: designation.title,
          code: designation.code,
          basePay: decimalOrNull(designation.basePay),
          basePayFrequency: designation.basePayFrequency ?? null,
          benefits: designation.benefits ?? null,
          status: designation.status,
        },
        "Designation created",
        201,
      ),
      origin,
    );
  } catch (e) {
    return withCors(handleApiError(e), origin);
  }
}
