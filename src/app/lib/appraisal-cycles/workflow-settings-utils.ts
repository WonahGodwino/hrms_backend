import { Prisma } from "@prisma/client";
import {
  AppraisalReminderRecipient,
  ApprovalRoutingType,
} from "@prisma/client";
import { VALID_ROUTING_TYPES } from "./appraisal-cycle-utils";

export const VALID_REMINDER_RECIPIENTS: AppraisalReminderRecipient[] = [
  "EMPLOYEE",
  "DIRECT_MANAGER",
  "DEPARTMENT_HEAD",
];

export { VALID_ROUTING_TYPES };

const DEFAULT_SETTINGS = {
  approvalRouting: "MANAGER_SKIPLEVEL_HR" as ApprovalRoutingType,
  requireHrSignoff: true,
  autoAdvanceApprovals: false,
  remindersEnabled: true,
  reminderLeadHours: 72,
  escalationEnabled: true,
  escalationThresholdHours: 48,
  reminderRecipients: [
    "EMPLOYEE",
    "DIRECT_MANAGER",
    "DEPARTMENT_HEAD",
  ] as AppraisalReminderRecipient[],
  peersPerEmployee: 2,
};

/**
 * Fetches the company's workflow settings row, or returns in-memory defaults
 * if one has never been saved (lazy creation — no row exists until the first
 * PATCH). Used both by the settings GET route and by cycle creation to seed
 * per-cycle values.
 */
export async function getOrDefaultSettings(
  tx: Prisma.TransactionClient,
  companyId: string,
) {
  const existing = await tx.appraisalWorkflowSettings.findUnique({
    where: { companyId },
  });
  return (
    existing ?? {
      companyId,
      id: null,
      ...DEFAULT_SETTINGS,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
    }
  );
}

interface LogSettingsActionParams {
  companyId: string;
  action: string;
  actorId: string;
  previousData?: any;
  newData?: any;
}

export async function logSettingsAction(
  client: Prisma.TransactionClient,
  {
    companyId,
    action,
    actorId,
    previousData,
    newData,
  }: LogSettingsActionParams,
) {
  return client.appraisalSettingsHistory.create({
    data: {
      companyId,
      action,
      actorId,
      previousData: previousData ?? undefined,
      newData: newData ?? undefined,
    },
  });
}

// The UI only promises behavior that is switched on. Flip a flag to true when its engine ships.
export const AUTOMATION_CAPABILITIES = {
  reminders: true, // automatic deadline reminders
  escalation: true, // overdue reviews flip the cycle to ESCALATED
  approvalRouting: false, // approval chains and HR sign-off are enforced
};
