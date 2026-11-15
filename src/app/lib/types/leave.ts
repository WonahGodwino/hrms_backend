// /src/app/lib/types/leave.ts

// Use Prisma types for consistency
import { 
  LeaveType as PrismaLeaveType,
  LeavePolicy as PrismaLeavePolicy,
  } from '@prisma/client';



interface LeaveType extends PrismaLeaveType {
  // Relations
  policy?: LeavePolicy;
}

interface LeavePolicy extends PrismaLeavePolicy {
  // Relations
  leaveTypes?: LeaveType[];
}












// Enum types for better type safety
export enum LeaveStatusEnum {
  PENDING = 'PENDING',
  MANAGER_APPROVED = 'MANAGER_APPROVED',
  HR_APPROVED = 'HR_APPROVED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  }

export enum ApprovalStepEnum {
  MANAGER = 'MANAGER',
  HR = 'HR',
  }



