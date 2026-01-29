// app/lib/types/leave.ts
export interface LeaveRequest {
  id: string;
  staffRecordId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejectionReason?: string;
  emergencyContact?: string;
  contactPhone?: string;
  approverId?: string;
  approvedAt?: Date;
  approvedBy?: string;
  handoverTo?: string;
  handoverNotes?: string;
  attachmentUrl?: string;
  fileName?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  staffRecord?: StaffRecord;
  leaveType?: LeaveType;
}

export interface LeaveType {
  id: string;
  policyId: string;
  name: string;
  code: string;
  description?: string;
  color?: string;
  isActive: boolean;
  
  // Relations
  policy?: LeavePolicy;
}

export interface LeavePolicy {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  maxDays: number;
  carryOver: number;
  isPaid: boolean;
  accrualRate?: number;
  minEmploymentMonths: number;
  requiresApproval: boolean;
  approvalRole: string;
  noticePeriod: number;
  documentationRequired: boolean;
  
  // Relations
  leaveTypes?: LeaveType[];
}

export interface StaffLeaveBalance {
  id: string;
  staffRecordId: string;
  leaveTypeId: string;
  year: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
  carriedOver: number;
  expiresAt?: Date;
  
  // Relations
  staffRecord?: StaffRecord;
  leaveType?: LeaveType;
}

export interface PublicHoliday {
  id: string;
  companyId: string;
  name: string;
  date: Date;
  description?: string;
  isRecurring: boolean;
  country?: string;
  state?: string;
}