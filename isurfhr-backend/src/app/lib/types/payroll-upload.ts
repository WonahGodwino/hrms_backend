// src/app/lib/types/payroll-upload.ts

// Existing interface - maintained for backward compatibility
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

// Extended interface with template information
export interface ExtendedPayrollUploadRecord extends PayrollUploadRecord {
  templateType?: 'ISURF_STANDARD' | 'BLUERIDGE' | 'DYNAMIC';
  templateId?: string;
  templateName?: string;
  sendEmails?: boolean;
  processingTimeMs?: number;
  processingStartTime?: Date;
  processingEndTime?: Date;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  metadata?: {
    fileSize?: number;
    fileType?: string;
    uploadedByRole?: string;
    companyName?: string;
    uploaderName?: string;
  };
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
  // New optional fields
  templateType?: string;
  templateId?: string;
  sendEmails?: boolean;
  metadata?: any;
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

// Extended summary with more details
export interface ExtendedPayrollUploadSummary extends PayrollUploadSummary {
  templateType?: string;
  templateName?: string;
  payslipsGenerated?: number;
  payslipsUpdated?: number;
  processingTimeMs?: number;
  status?: string;
  companyName?: string;
  uploaderName?: string;
  successRate?: number;
  failedRate?: number;
}

// Error details for better error handling
export interface UploadErrorDetail {
  rowNumber: number;
  staffName: string;
  staffId?: string;
  email?: string;
  error: string;
  missingColumns?: string[];
  suggestions: string;
  severity?: 'ERROR' | 'WARNING' | 'INFO';
  field?: string;
  expectedFormat?: string;
}

export interface EmailFailureDetail {
  rowNumber: number;
  email: string;
  error: string;
  staffName: string;
  staffId: string;
  attemptNumber?: number;
  timestamp?: string;
}

export interface EnhancedErrorDetails {
  detailedErrors?: UploadErrorDetail[];
  emailFailures?: EmailFailureDetail[];
  totalFailed: number;
  totalSuccessful: number;
  timestamp: string;
  summary?: {
    missingFields: string[];
    invalidFormats: string[];
    duplicateRecords: string[];
    staffNotFound: string[];
  };
}

// Upload statistics
export interface UploadStatistics {
  uploadId: string;
  templateType: string;
  templateName?: string;
  totalProcessed: number;
  successful: number;
  failed: number;
  payslipsGenerated: number;
  payslipsUpdated: number;
  emailsSent: number;
  emailAttempts: number;
  emailSuccessRate: number;
  processingTimeMs: number;
  recordsPerSecond: number;
  startTime: Date;
  endTime: Date;
}

// Upload filter options
export interface UploadFilters {
  startDate?: Date;
  endDate?: Date;
  templateType?: 'ISURF_STANDARD' | 'BLUERIDGE' | 'DYNAMIC';
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  minSuccess?: number;
  maxSuccess?: number;
  hasErrors?: boolean;
  uploadedBy?: string;
}

// Paginated upload response
export interface PaginatedUploadResponse {
  uploads: PayrollUploadSummary[] | ExtendedPayrollUploadSummary[];
  summary: {
    totalUploads: number;
    totalRecords: number;
    totalSuccessful: number;
    totalFailed: number;
    averageSuccessRate: number;
  };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}