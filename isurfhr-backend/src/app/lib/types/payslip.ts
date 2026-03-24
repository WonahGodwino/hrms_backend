// src/app/lib/types/payslip.ts

// Existing interface - maintained for backward compatibility
export interface PayslipItem {
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
  // Template information
  templateType?: 'ISURF_STANDARD' | 'BLUERIDGE' | 'DYNAMIC' | 'STANDARD';
  templateName?: string;
  isDynamic?: boolean;
  templateId?: string;
  
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

// Extended staff record info with additional fields
export interface ExtendedStaffRecordInfo extends StaffRecordInfo {
  bankName?: string;
  accountNumber?: string;
  phone?: string;
  isActive?: boolean;
  companyId?: string;
  companyName?: string;
  joinedDate?: Date;
  employmentType?: string;
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

export interface StaffItem {
  id: string;
  staffId: string;
  name: string;
  email: string;
  department: string;
  position: string;
  isActive: boolean;
  companyName: string;
  payslipCount: number;
  actions: {
    viewPayslips: string;
    downloadAllPayslips: string;
  };
}

// Extended staff item with more details
export interface ExtendedStaffItem extends StaffItem {
  phone?: string;
  bankName?: string;
  accountNumber?: string;
  lastPayslipDate?: Date;
  totalEarnings?: number;
  averageNetPay?: number;
}

// Payslip summary statistics
export interface PayslipSummary {
  totalPayslips: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalTax: number;
  totalPension: number;
  earliestPayslip: string | null;
  latestPayslip: string | null;
  averageGrossPay: number;
  averageNetPay: number;
}

// Payslip filter options
export interface PayslipFilters {
  year?: number;
  month?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  templateType?: 'ISURF_STANDARD' | 'BLUERIDGE' | 'DYNAMIC';
  includeDetails?: boolean;
}

// Payslip paginated response
export interface PaginatedPayslipResponse {
  staff: StaffRecordInfo;
  payslips: PayslipItem[] | ExtendedPayslipItem[];
  summary: PayslipSummary;
  availableYears: number[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
