// src/app/lib/types/payslip.ts

// Existing interface - maintained for backward compatibility
interface PayslipItem {
  id: string;
  month: string;
  year: number;
  grossPay: string | null;
  netPay: string | null;
  createdAt: Date;
  fileName: string;
  downloadUrl: string;
}

// Extended interface with new fields (optional for backward compatibility)
export interface ExtendedPayslipItem extends PayslipItem {
  // Which payslip this is (Salary, Transport Allowance, Bonus, ...) — see
  // Payroll.payslipCategory. Null for rows written before categories existed.
  payslipCategory?: string | null;
  // Template information
  templateType?: 'ISURF_STANDARD' | 'BLUERIDGE' | 'DYNAMIC' | 'STANDARD';
  templateName?: string;
  isDynamic?: boolean;
  templateId?: string;
  // Notification delivery outcome for the email HR sent when publishing this
  // payslip (Payslip.emailStatus) — 'SENT' | 'FAILED' | null (never attempted,
  // e.g. published before this tracking existed). The payslip is visible to
  // the staff member regardless of this value; it's shown only as a badge.
  notificationStatus?: string | null;


  // Detailed breakdown (only when requested)
  earningsBreakdown?: Array<{
    label: string;
    value: number;
    type: 'earnings' | 'deduction' | 'summary';
    isCustom?: boolean;
    section?: string;
  }>;
  deductionsBreakdown?: Array<{
    label: string;
    value: number;
    type: 'earnings' | 'deduction' | 'summary';
    isCustom?: boolean;
    section?: string;
  }>;
  totals?: {
    grossPay: number;
    totalDeductions: number;
    netPay: number;
  };
  
  // Statistics
  customFieldsCount?: number;
  earningsCount?: number;
  deductionsCount?: number;
  
  // Additional metadata
  fileSize?: number;
  fileType?: string;
  filePath?: string;
}

export interface StaffRecordInfo {
  id: string;
  staffId: string;
  name: string;
  email: string;
  department: string;
  position: string;
}


export interface CompanyInfo {
  id: string;
  companyName: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxId?: string;
}





