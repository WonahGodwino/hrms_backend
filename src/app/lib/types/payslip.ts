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
  name: string;
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