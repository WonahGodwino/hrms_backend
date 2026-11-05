// /src/app/lib/notifications/helpers.ts - COMPLETE WORKING VERSION
import { prisma } from "@/app/lib/prisma";

// Notification types
export const NOTIFICATION_TYPES = {
  LEAVE_REQUEST_SUBMITTED: "LEAVE_REQUEST_SUBMITTED",
  LEAVE_APPROVAL_NEEDED: "LEAVE_APPROVAL_NEEDED",
  LEAVE_HR_APPROVAL_NEEDED: "LEAVE_HR_APPROVAL_NEEDED",
  LEAVE_MANAGER_APPROVED: "LEAVE_MANAGER_APPROVED",
  LEAVE_APPROVED: "LEAVE_APPROVED",
  LEAVE_REJECTED: "LEAVE_REJECTED",
  LEAVE_CANCELLED: "LEAVE_CANCELLED",
  LEAVE_REMINDER: "LEAVE_REMINDER",
  LEAVE_BALANCE_LOW: "LEAVE_BALANCE_LOW",
  LEAVE_UPCOMING: "LEAVE_UPCOMING",
  WELCOME_STAFF: "WELCOME_STAFF",
  PAYSLIP_UPLOADED: "PAYSLIP_UPLOADED",
  COMPANY_ANNOUNCEMENT: "COMPANY_ANNOUNCEMENT",
  GLOBAL_ANNOUNCEMENT: "GLOBAL_ANNOUNCEMENT",
  PHED_APPROVAL_ACTION_NEEDED: "PHED_APPROVAL_ACTION_NEEDED",
  PHED_APPROVAL_FLAGGED: "PHED_APPROVAL_FLAGGED",
  PHED_APPROVAL_FINAL: "PHED_APPROVAL_FINAL",
  PHED_APPROVAL_PROGRESS: "PHED_APPROVAL_PROGRESS",
  PHED_ACCESS_ROLE_CHANGED: "PHED_ACCESS_ROLE_CHANGED",
  LOAN_GUARANTOR_REQUEST: "LOAN_GUARANTOR_REQUEST",
  LOAN_GUARANTOR_ACCEPTED: "LOAN_GUARANTOR_ACCEPTED",
  LOAN_GUARANTOR_DECLINED: "LOAN_GUARANTOR_DECLINED",
  LOAN_APPROVED: "LOAN_APPROVED",
  LOAN_REJECTED: "LOAN_REJECTED",
  LOAN_DISBURSED: "LOAN_DISBURSED",
  // Multi-step approval engine (Staff Loans & Benefits rebuild) — shared by
  // loan requests, benefit requests, and benefit claims.
  APPROVAL_STEP_ADVANCED: "APPROVAL_STEP_ADVANCED",
  APPROVAL_ACTION_NEEDED: "APPROVAL_ACTION_NEEDED",
  APPROVAL_NO_ELIGIBLE_APPROVER: "APPROVAL_NO_ELIGIBLE_APPROVER",
  BENEFIT_REQUEST_APPROVED: "BENEFIT_REQUEST_APPROVED",
  BENEFIT_REQUEST_REJECTED: "BENEFIT_REQUEST_REJECTED",
  BENEFIT_ALLOCATED: "BENEFIT_ALLOCATED",
  BENEFIT_CLAIM_APPROVED: "BENEFIT_CLAIM_APPROVED",
  BENEFIT_CLAIM_REJECTED: "BENEFIT_CLAIM_REJECTED",
  BENEFIT_CLAIM_PAID: "BENEFIT_CLAIM_PAID",
  COMPETENCY_REVIEW_ASSIGNED: "COMPETENCY_REVIEW_ASSIGNED",
  COMPETENCY_REVIEW_DUE_SOON: "COMPETENCY_REVIEW_DUE_SOON",
  COMPETENCY_REVIEW_OVERDUE: "COMPETENCY_REVIEW_OVERDUE",
  COMPETENCY_REVIEW_COMPLETED: "COMPETENCY_REVIEW_COMPLETED",
  COMPETENCY_REVIEW_CANCELLED: "COMPETENCY_REVIEW_CANCELLED",
  APPRAISAL_CYCLE_STARTED: "APPRAISAL_CYCLE_STARTED",
  APPRAISAL_CYCLE_ADDED: "APPRAISAL_CYCLE_ADDED",
  APPRAISAL_CYCLE_DEADLINE_SOON: "APPRAISAL_CYCLE_DEADLINE_SOON",
  APPRAISAL_CYCLE_OVERDUE: "APPRAISAL_CYCLE_OVERDUE",
  APPRAISAL_CYCLE_ESCALATED: "APPRAISAL_CYCLE_ESCALATED",
  APPRAISAL_CYCLE_AUTO_START_FAILED: "APPRAISAL_CYCLE_AUTO_START_FAILED",
  APPRAISAL_CYCLE_REMINDER: "APPRAISAL_CYCLE_REMINDER",
  PIP_ESCALATED: "PIP_ESCALATED",
  PIP_ESCALATION_COMMENT: "PIP_ESCALATION_COMMENT",
  PIP_ESCALATION_RESOLVED: "PIP_ESCALATION_RESOLVED",
  PROMOTION_SUBMITTED: "PROMOTION_SUBMITTED",
  PROMOTION_DECIDED: "PROMOTION_DECIDED",
  CAREER_ACTION_ASSIGNED: "CAREER_ACTION_ASSIGNED",
  COMPARISON_REPORT_SHARED: "COMPARISON_REPORT_SHARED",
  SUCCESSION_REPORT_SHARED: "SUCCESSION_REPORT_SHARED",
  FAIRNESS_CASE_ASSIGNED: "FAIRNESS_CASE_ASSIGNED",
  FAIRNESS_CASE_ESCALATED: "FAIRNESS_CASE_ESCALATED",
  APPLICATION_WITHDRAWN: "APPLICATION_WITHDRAWN",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

// Create a notification
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data: Record<string, any> = {},
  companyId: string,
) {
  try {
    const notificationData: any = {
      userId,
      type,
      title,
      message,
      companyId,
      read: false,
    };

    // Only add data field if we have data
    if (Object.keys(data).length > 0) {
      notificationData.data = JSON.stringify(data);
    }

    return await prisma.notification.create({
      data: notificationData,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

// Create leave-specific notification (includes leaveRequestId in data)
export async function createLeaveNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  leaveRequestId: string,
  additionalData: Record<string, any> = {},
  companyId: string,
) {
  const data = {
    leaveRequestId,
    ...additionalData,
  };

  return createNotification(userId, type, title, message, data, companyId);
}

// Get notifications for a specific leave request
export async function getNotificationsForLeaveRequest(
  leaveRequestId: string,
  companyId: string,
) {
  try {
    // Get all LEAVE notifications for the company
    const notifications = await prisma.notification.findMany({
      where: {
        companyId,
        type: { contains: "LEAVE" },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        read: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffId: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Filter client-side to get only notifications for this leave request
    const filteredNotifications = notifications.filter((notification) => {
      if (!notification.data) return false;
      try {
        const parsedData = JSON.parse(notification.data as string);
        return parsedData?.leaveRequestId === leaveRequestId;
      } catch (e) {
        return false;
      }
    });

    return filteredNotifications.map((notification) => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data as string) : null,
    }));
  } catch (error) {
    console.error("Error getting leave request notifications:", error);
    return [];
  }
}
