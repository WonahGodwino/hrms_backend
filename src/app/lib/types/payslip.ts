// src/app/lib/types/payslip.ts
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
// src/app/lib/types/payroll-upload.ts
export interface PayrollUploadRecord {
  id: string;
  companyId: string;
  fileName: string;
  filePath: string;
  processedFilePath: string | null;
  processedFileName: string | null;
  totalRecords: number;
  successful: number;
  failed: number;
  payslipsGenerated: number | null;
  payslipsUpdated: number | null;
  emailsSent: number | null;
  emailAttempts: number | null;
  emailFailures: number | null;
  errors: string[];
  errorDetails: {
    detailedErrors?: Array<{
      rowNumber: number;
      staffName: string;
      staffId?: string;
      email?: string;
      error: string;
      missingColumns?: string[];
      suggestions: string;
    }>;
    emailFailures?: Array<{
      rowNumber: number;
      email: string;
      error: string;
      staffName: string;
      staffId: string;
    }>;
    totalFailed?: number;
    totalSuccessful?: number;
    timestamp?: string;
  } | null;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayrollUploadCreateInput {
  companyId: string;
  fileName: string;
  filePath: string;
  processedFilePath?: string | null;
  processedFileName?: string | null;
  totalRecords: number;
  successful: number;
  failed: number;
  payslipsGenerated?: number;
  payslipsUpdated?: number;
  emailsSent?: number;
  emailAttempts?: number;
  emailFailures?: number;
  errors: string[];
  errorDetails?: any;
  uploadedBy: string;
}

export interface PayrollUploadSummary {
  id: string;
  fileName: string;
  totalRecords: number;
  successful: number;
  failed: number;
  emailsSent: number | null;
  createdAt: Date;
  uploadedBy: string;
  hasFailedRecords: boolean;
  downloadUrl?: string;
}