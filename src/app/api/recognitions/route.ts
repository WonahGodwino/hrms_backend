import { NextRequest } from "next/server";
import { Prisma, RecognitionCategory } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  RECOGNITION_POINTS,
  enumOf,
  parseRecognitionPayload,
  recognitionSelect,
  recognitionVisibleWhere,
  resolveSelf,
  serializeRecognition,
  validAttachmentUrl,
} from "@/app/lib/feedback";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const ROLES = ["STAFF", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];

// GET /api/recognitions?companyId=...
// Optional: scope (mine = given or received, default | company = everything the caller may see),
//           category, limit (max 50), offset
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(
      authHeader.replace("Bearer ", ""),
      ROLES,
    );

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const category = searchParams.get("category");
    if (category && !enumOf(Object.values(RecognitionCategory), category))
      return withCors(ApiResponse.error("Invalid category", 400), origin);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      50,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );
    const mine = searchParams.get("scope") !== "company";

    const where: Prisma.RecognitionWhereInput = {
      companyId,
      ...(category ? { category: category as RecognitionCategory } : {}),
      AND: [
        mine ? { OR: [{ giverId: self.id }, { recipientId: self.id }] } : {},
        recognitionVisibleWhere(self),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.recognition.findMany({
        where,
        select: recognitionSelect,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.recognition.count({ where }),
    ]);

    return withCors(
      ApiResponse.success(
        { total, items: rows.map((r) => serializeRecognition(r, self.id)) },
        "Recognitions retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/recognitions
// body: { companyId, recipientId, category, message, coreValues?, visibility?, goalId?, attachment?: { fileName, fileUrl } }
// Also creates the recipient's feed item (category RECOGNITION, positive, core values as tags).
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(
      authHeader.replace("Bearer ", ""),
      ROLES,
    );

    const body = await request.json();
    const companyId = body?.companyId;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const parsed = parseRecognitionPayload(body);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);
    if (parsed.recipientId === self.id)
      return withCors(
        ApiResponse.error("You can't recognize yourself", 400),
        origin,
      );
    if (
      parsed.attachment &&
      !validAttachmentUrl(companyId, parsed.attachment.fileUrl)
    )
      return withCors(
        ApiResponse.error("Invalid attachment fileUrl", 400),
        origin,
      );

    const recipient = await prisma.staffRecord.findFirst({
      where: { id: parsed.recipientId, companyId, isActive: true },
      select: { id: true, departmentId: true },
    });
    if (!recipient)
      return withCors(ApiResponse.error("Colleague not found", 404), origin);

    // A linked goal must belong to the recipient
    if (parsed.goalId) {
      const goal = await prisma.goal.findFirst({
        where: {
          id: parsed.goalId,
          companyId,
          staffRecordId: recipient.id,
          isArchived: false,
        },
        select: { id: true },
      });
      if (!goal)
        return withCors(
          ApiResponse.error(
            "The linked goal was not found for this colleague",
            400,
          ),
          origin,
        );
    }

    const label =
      parsed.category.charAt(0) + parsed.category.slice(1).toLowerCase();
    let bufInfo: { buffer: Buffer; mimeType: string; sizeBytes: number } | null = null;
    if (parsed.attachment?.fileUrl) {
      bufInfo = await readUploadedBuffer(parsed.attachment.fileUrl, companyId);
    }

    const created = await prisma.$transaction(async (tx) => {
      const rec = await tx.recognition.create({
        data: {
          companyId,
          giverId: self.id,
          recipientId: recipient.id,
          departmentId: recipient.departmentId,
          goalId: parsed.goalId,
          category: parsed.category,
          title: `${label} Recognition`,
          message: parsed.message,
          coreValues: parsed.coreValues,
          visibility: parsed.visibility,
          points: RECOGNITION_POINTS,
          attachmentName: parsed.attachment?.fileName ?? null,
          attachmentUrl: parsed.attachment?.fileUrl ?? null,
          attachmentMime: bufInfo?.mimeType ?? null,
          attachmentSize: bufInfo?.sizeBytes ?? null,
          attachmentData: bufInfo?.buffer ? new Uint8Array(bufInfo.buffer) : null,
        },
      });
      const fb = await tx.feedback.create({
        data: {
          companyId,
          authorId: self.id,
          recipientId: recipient.id,
          recognitionId: rec.id,
          category: "RECOGNITION",
          sentiment: "POSITIVE",
          content: parsed.message,
          tags: parsed.coreValues.map((v) => v.toLowerCase()),
        },
      });
      await tx.feedbackHistory.createMany({
        data: [
          {
            recognitionId: rec.id,
            companyId,
            action: "RECOGNITION_GIVEN",
            actorId: self.id,
            newData: {
              recipientId: recipient.id,
              category: parsed.category,
              visibility: parsed.visibility,
            },
          },
          {
            feedbackId: fb.id,
            companyId,
            action: "FEEDBACK_CREATED",
            actorId: self.id,
          },
        ],
      });
      return tx.recognition.findUniqueOrThrow({
        where: { id: rec.id },
        select: recognitionSelect,
      });
    });

    return withCors(
      ApiResponse.success(
        serializeRecognition(created, self.id),
        "Recognition sent successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
