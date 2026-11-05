import {
  Prisma,
  PerformanceActionPriority,
  PerformanceActionType,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { MAX_LONG_TEXT } from "@/app/lib/self-appraisal";

export const MAX_ACTION_ATTACHMENTS = 10;

export const ACTION_INCLUDE = {
  attachments: {
    where: { removedAt: null },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.PerformanceActionInclude;

export type ActionWithAttachments = Prisma.PerformanceActionGetPayload<{
  include: typeof ACTION_INCLUDE;
}>;

export function serializeAction(a: ActionWithAttachments) {
  return {
    id: a.id,
    cycleId: a.cycleId,
    staffRecordId: a.staffRecordId,
    type: a.type,
    priority: a.priority,
    status: a.status,
    notes: a.notes ?? "",
    dueDate: a.dueDate,
    assignedAt: a.assignedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    attachments: a.attachments.map((x) => ({
      id: x.id,
      fileName: x.fileName,
      fileUrl: x.fileUrl,
      mimeType: x.mimeType,
      sizeBytes: x.sizeBytes,
      downloadPath: `/api/performance-actions/${a.id}/attachments/${x.id}/file`,
    })),
  };
}

// Listing scope: managers see actions they created or that target their direct reports
export const actionScopeWhere = (
  companyWide: boolean,
  staffRecordId: string,
): Prisma.PerformanceActionWhereInput =>
  companyWide
    ? {}
    : {
        OR: [
          { createdById: staffRecordId },
          { staffRecord: { managerId: staffRecordId } },
        ],
      };

// Editing scope: the creator, or HR / ADMIN / SUPER_ADMIN
export async function findManagedAction(
  id: string,
  companyId: string,
  companyWide: boolean,
  staffRecordId: string,
) {
  return prisma.performanceAction.findFirst({
    where: {
      id,
      companyId,
      ...(companyWide ? {} : { createdById: staffRecordId }),
    },
    include: ACTION_INCLUDE,
  });
}

export type ActionFields = {
  type?: PerformanceActionType;
  priority?: PerformanceActionPriority;
  notes?: string;
  dueDate?: Date | null;
};

export function parseActionPayload(
  body: any,
  isCreate: boolean,
):
  | { error: string }
  | { fields: ActionFields; assign: boolean; changed: string[] } {
  const fields: ActionFields = {};
  const changed: string[] = [];

  if (isCreate || body?.type !== undefined) {
    if (!Object.values(PerformanceActionType).includes(body?.type))
      return {
        error: `type must be one of: ${Object.values(PerformanceActionType).join(", ")}`,
      };
    fields.type = body.type;
    changed.push("type");
  }

  if (body?.priority !== undefined) {
    if (!Object.values(PerformanceActionPriority).includes(body.priority))
      return {
        error: `priority must be one of: ${Object.values(PerformanceActionPriority).join(", ")}`,
      };
    fields.priority = body.priority;
    changed.push("priority");
  }

  if (body?.notes !== undefined) {
    if (typeof body.notes !== "string")
      return { error: "notes must be a string" };
    if (body.notes.length > MAX_LONG_TEXT)
      return { error: `notes must be at most ${MAX_LONG_TEXT} characters` };
    fields.notes = body.notes;
    changed.push("notes");
  }

  if (body?.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") {
      fields.dueDate = null;
    } else {
      const d =
        typeof body.dueDate === "string" ? new Date(body.dueDate) : null;
      if (!d || Number.isNaN(d.getTime()))
        return { error: "dueDate must be a valid date" };
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (d < today) return { error: "dueDate cannot be in the past" };
      fields.dueDate = d;
    }
    changed.push("dueDate");
  }

  if (body?.assign !== undefined && typeof body.assign !== "boolean")
    return { error: "assign must be a boolean" };

  return { fields, assign: body?.assign === true, changed };
}
