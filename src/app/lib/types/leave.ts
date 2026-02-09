// /src/app/lib/types/leave.ts

// Use Prisma types for consistency
import { 
  StaffRecord as PrismaStaffRecord,
  LeaveRequest as PrismaLeaveRequest,
  LeaveType as PrismaLeaveType,
  LeavePolicy as PrismaLeavePolicy,
  StaffLeaveBalance as PrismaStaffLeaveBalance,
  PublicHoliday as PrismaPublicHoliday
} from '@prisma/client';

// Base types from Prisma models
export interface StaffRecord extends Omit<PrismaStaffRecord, 'password'> {
  // Remove password field for security
}

export interface LeaveRequest extends PrismaLeaveRequest {
  // Relations
  staffRecord?: StaffRecord;
  leaveType?: LeaveType;
  managerApprover?: StaffRecord;
  handoverStaff?: StaffRecord;
}

export interface LeaveType extends PrismaLeaveType {
  // Relations
  policy?: LeavePolicy;
}

export interface LeavePolicy extends PrismaLeavePolicy {
  // Relations
  leaveTypes?: LeaveType[];
}

export interface StaffLeaveBalance extends PrismaStaffLeaveBalance {
  // Relations
  staffRecord?: StaffRecord;
  leaveType?: LeaveType;
}

export interface PublicHoliday extends PrismaPublicHoliday {
  // Add any additional fields if needed
}

// Extended types for API responses
export interface LeaveApplicationResponse {
  success: boolean;
  message: string;
  data: {
    leaveRequestId: string;
    referenceNumber?: string;
    status: string;
    currentStep: string;
    requestedDays: number;
    leaveType: {
      id: string;
      name: string;
      code: string;
      policy: string;
    };
    policyApplied: {
      name: string;
      maxDays: number;
      noticePeriod: number;
      minEmploymentMonths: number;
      requiresApproval: boolean;
      approvalWorkflow: string;
      isPaid: boolean;
      documentationRequired: boolean;
      carryOver: number;
      accrualRate?: number;
    };
    leaveBalance: {
      total: number;
      used: number;
      pending: number;
      available: number;
      carriedOver: number;
    };
    workWeekInfo: {
      pattern: string;
      workDays: number[];
      description: string;
    };
    nextSteps: string[];
    approvers: {
      manager: {
        id: string;
        name: string;
        email: string;
      } | null;
      hr: string | null;
    };
    notifications: {
      sentToApplicant: boolean;
      sentToManager: boolean;
      sentToHR: boolean;
    };
    warnings?: string[];
    importantNotes: string[];
    additionalInfo: {
      isHalfDay: boolean;
      halfDayPart?: 'FIRST_HALF' | 'SECOND_HALF';
      medicalCertificate?: {
        number: string;
        date?: string;
        issuer?: string;
      } | null;
    };
  };
}

// Request types
export interface LeaveApplicationRequest {
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  reason: string;
  emergencyContact?: string;
  contactPhone?: string;
  handoverTo?: string;
  handoverNotes?: string;
  attachmentUrl?: string;
  fileName?: string;
  isHalfDay?: boolean;
  halfDayPart?: 'FIRST_HALF' | 'SECOND_HALF';
  medicalCertificateNumber?: string;
  medicalCertificateDate?: string;
  medicalCertificateIssuer?: string;
}

export interface LeaveStatusUpdateRequest {
  leaveRequestId: string;
  action: 'APPROVE' | 'REJECT' | 'CANCEL';
  comments?: string;
}

// Notification types
export interface LeaveNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: string;
  read: boolean;
  createdAt: Date;
  companyId: string;
}

// Work week configuration
export interface WorkWeekConfig {
  companyId: string;
  workWeekPattern: string;
  workDays: number[];
  description: string;
}

// Leave statistics
export interface LeaveStats {
  totalRequests: number;
  approved: number;
  pending: number;
  rejected: number;
  cancelled: number;
  usedDays: number;
  availableDays: number;
  pendingDays: number;
}

// Calendar event for leave
export interface LeaveCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  type: 'leave' | 'holiday' | 'half-day';
  status: string;
  staffName: string;
  department?: string;
  leaveType: string;
  color?: string;
  isHalfDay?: boolean;
  halfDayPart?: 'FIRST_HALF' | 'SECOND_HALF';
}

// Approval workflow
export interface LeaveApprovalWorkflow {
  currentStep: 'MANAGER' | 'HR' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  managerApproved: boolean;
  hrApproved: boolean;
  managerApprovedAt?: Date;
  hrApprovedAt?: Date;
  managerComments?: string;
  hrComments?: string;
}

// Extended leave request with full relations
export interface LeaveRequestWithDetails extends LeaveRequest {
  staffRecord: StaffRecord;
  leaveType: LeaveType & { policy?: LeavePolicy };
  managerApprover?: StaffRecord;
  handoverStaff?: StaffRecord;
  notifications?: LeaveNotification[];
}

// Type guards and helpers
export function isLeaveRequestApproved(leaveRequest: LeaveRequest): boolean {
  return leaveRequest.status === 'APPROVED' || 
         leaveRequest.status === 'MANAGER_APPROVED' || 
         leaveRequest.status === 'HR_APPROVED';
}

export function isLeaveRequestPending(leaveRequest: LeaveRequest): boolean {
  return leaveRequest.status === 'PENDING' || 
         leaveRequest.currentStep === 'MANAGER' || 
         leaveRequest.currentStep === 'HR';
}

export function getLeaveRequestColor(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'green';
    case 'PENDING':
      return 'yellow';
    case 'MANAGER_APPROVED':
      return 'blue';
    case 'HR_APPROVED':
      return 'purple';
    case 'REJECTED':
      return 'red';
    case 'CANCELLED':
      return 'gray';
    default:
      return 'gray';
  }
}

// Enum types for better type safety
export enum LeaveStatusEnum {
  PENDING = 'PENDING',
  MANAGER_APPROVED = 'MANAGER_APPROVED',
  HR_APPROVED = 'HR_APPROVED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum ApprovalStepEnum {
  MANAGER = 'MANAGER',
  HR = 'HR',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum HalfDayPartEnum {
  FIRST_HALF = 'FIRST_HALF',
  SECOND_HALF = 'SECOND_HALF'
}

export enum ApprovalWorkflowEnum {
  MANAGER_ONLY = 'MANAGER_ONLY',
  HR_ONLY = 'HR_ONLY',
  MANAGER_THEN_HR = 'MANAGER_THEN_HR'
}

// Validation result type
export interface LeaveValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  policyDetails: {
    name: string;
    maxDays: number;
    noticePeriod: number;
    minEmploymentMonths: number;
    requiresApproval: boolean;
    approvalWorkflow: string;
    isPaid: boolean;
    documentationRequired: boolean;
    carryOver: number;
    accrualRate?: number;
  };
}