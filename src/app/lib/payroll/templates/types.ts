// src/app/lib/payroll/templates/types.ts

// Template types
export type PayrollTemplateType = 'ISURF_STANDARD' | 'BLUERIDGE' | 'DYNAMIC';

// Interface for template fields (used in dynamic templates)
export interface TemplateField {
  id: string;
  displayName: string;
  systemField: string;
  dataType: string;
  required: boolean;
  section: string;
  aliases?: string[];
  showOnPayslip?: boolean;
  order?: number;
}

// Interface for custom field values stored in Payroll.customFields
export interface CustomFieldValue {
  value: any;
  displayName: string;
  dataType: string;
  section: string;
  required: boolean;
  showOnPayslip: boolean;
}

// Interface for payslip display items
export interface PayslipDisplayItem {
  label: string;
  value: number;
  type: 'earnings' | 'deduction';
  dataType: string;
  isCustom: boolean;
  section?: string;
}

// Interface for fixed template configuration
export interface TemplateConfig {
  id: Exclude<PayrollTemplateType, 'DYNAMIC'>;
  name: string;
  description: string;
  requiredColumns: string[];
  canonicalHeaders: Record<string, string>;
  payslipTitle: string;
  displaySections: {
    earnings: Array<{
      displayName: string;
      sourceField: string;
      conditional?: boolean;
    }>;
    deductions: Array<{
      displayName: string;
      sourceField: string;
      conditional?: boolean;
    }>;
  };
}

// Interface for parsed payroll row (used in fixed templates)
export interface ParsedPayrollRow {
  rowNumber: number;
  staffId: string;
  email: string;
  fullName: string;
  periodMonth: number;
  periodYear: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  transportationAllowance: number;
  otherAllowances: number;
  grossPay: number;
  payee: number;
  pension: number;
  netPay: number;
  daysInMonth: number;
  daysWorked: number;
  rawRow: any;
  bonusKPI?: number;
  deductions?: number;
  
  // BLUERIDGE specific fields
  overtimeIncome?: number;
  communicationAllowance?: number;
  outstandingIncome?: number;
  
  // Additional allowance fields
  dressingAllowance?: number;
  leaveAllowance?: number;
  entertainmentAllowance?: number;
  utilityAllowance?: number;
  
  // Payment fields
  walletPayment?: number;
  commercialPayment?: number;
  proratedGrossPay?: number;
  
  // Position field
  position?: string;
}

// Interface for dynamic payroll data
export interface DynamicPayrollData {
  staffId: string;
  staffName: string;
  email: string;
  month: string;
  year: number;
  periodMonth: number;
  periodYear: number;
  customFields: Record<string, CustomFieldValue>;
  earningsList: PayslipDisplayItem[];
  deductionsList: PayslipDisplayItem[];
  totals: {
    grossPay: number;
    totalDeductions: number;
    netPay: number;
  };
}

// Processing result interface (used by both fixed and dynamic processors)
export interface ProcessingResult {
  successful: number;
  failed: number;
  payslipsGenerated: number;
  payslipsUpdated: number;
  emailsSent: number;
  emailAttempts: number;
  emailFailures: Array<{
    rowNumber: number;
    email: string;
    error: string;
    staffName: string;
    staffId: string;
  }>;
  processedRecords: Array<{
    staffId: string;
    staffName: string;
    month: string;
    year: number;
    netSalary: number;
    grossPay?: number;
    totalDeductions?: number;
    status: 'PROCESSED' | 'UPDATED';
    emailSent: boolean;
    emailStatus: 'SENT' | 'FAILED' | 'SKIPPED';
    payslipId: string;
    fileName: string;
    earningsCount?: number;
    deductionsCount?: number;
    templateFields?: number;
    [key: string]: any;
  }>;
  failedRecords: any[];
  errors: string[];
}

// Template processor interface
export interface TemplateProcessor {
  processFile(
    buffer: Buffer,
    fileExtension: string,
    companyId: string,
    user: any,
    sendEmails: boolean,
    templateId?: string
  ): Promise<ProcessingResult>;
}

// Fixed templates configuration
export const PAYROLL_TEMPLATES: Record<Exclude<PayrollTemplateType, 'DYNAMIC'>, TemplateConfig> = {
  ISURF_STANDARD: {
    id: 'ISURF_STANDARD',
    name: 'Isurf Standard Template',
    description: 'Original Isurf payroll template',
    payslipTitle: 'STANDARD PAYSLIP',
    requiredColumns: [
      'Name', 'EMAIL', 'Gross Pay', 'Basic', 'Housing', 'Transport', 
      'Dressing', 'Leave Allowance', 'Entertainment', 'Utility', 'Payee', 
      'Pension', 'Deduction', 'Bonus KPI', 'Net Salary', 'FINAL GROSS', 
      'Medical Contribution', 'No of Working Days in the Month', 'No of days Worked'
    ],
    canonicalHeaders: {
      's/n': 'S/N',
      'name': 'Name',
      'resumption date': 'Resumption Date',
      'no of working days in the month': 'No of Working Days in the Month',
      'no of days worked': 'No of days Worked',
      'gross pay': 'Gross Pay',
      'prorated gross pay': 'Prorated Gross Pay',
      'basic': 'Basic',
      'housing': 'Housing',
      'transport': 'Transport',
      'dressing': 'Dressing',
      'leave allowance': 'Leave Allowance',
      'entertainment': 'Entertainment',
      'utility': 'Utility',
      'salary of attendance': 'Salary Of Attendance',
      "prorated gross pay with extra all'wce": "PRORATED GROSS PAY WITH EXTRA ALL'WCE",
      'taxable income': 'TAXABLE INCOME',
      'consolidated relief': 'Consolidated Relief',
      'payee': 'Payee',
      'pension': 'Pension',
      'deduction': 'Deduction',
      'bonus kpi': 'Bonus KPI',
      'net salary': 'Net Salary',
      'final gross': 'FINAL GROSS',
      'medical contribution': 'Medical Contribution',
      'employer pension': 'Employer Pension',
      'nsitf': 'NSITF',
      'prorated sub total invoice': 'Prorated Sub Total Invoice',
      'mgt fee': 'Mgt Fee',
      'vat on management fee @7.5%': 'Vat on Management Fee @7.5%',
      'total invoice value': 'Total Invoice Value',
      'email': 'EMAIL',
      'month': 'Month',
      'year': 'Year',
    },
    displaySections: {
      earnings: [
        { displayName: 'Basic Salary', sourceField: 'basicSalary', conditional: false },
        { displayName: 'Housing Allowance', sourceField: 'housingAllowance', conditional: false },
        { displayName: 'Transport Allowance', sourceField: 'transportAllowance', conditional: false },
        { displayName: 'Dressing Allowance', sourceField: 'dressingAllowance', conditional: true },
        { displayName: 'Leave Allowance', sourceField: 'leaveAllowance', conditional: true },
        { displayName: 'Entertainment Allowance', sourceField: 'entertainmentAllowance', conditional: true },
        { displayName: 'Utility Allowance', sourceField: 'utilityAllowance', conditional: true },
        { displayName: 'Other Allowances', sourceField: 'otherAllowances', conditional: true },
        { displayName: 'Performance Bonus', sourceField: 'bonusKPI', conditional: true }
      ],
      deductions: [
        { displayName: 'PAYE Tax', sourceField: 'payee', conditional: false },
        { displayName: 'Pension Contribution', sourceField: 'pension', conditional: false },
        { displayName: 'Other Deductions', sourceField: 'deductions', conditional: true }
      ]
    }
  },
  BLUERIDGE: {
    id: 'BLUERIDGE',
    name: 'Blueridge Template',
    description: 'Blueridge payroll template with different structure',
    payslipTitle: 'BLUERIDGE PAYSLIP',
    requiredColumns: [
      'Staff ID', 'Name', 'Basic Salary before Verify(coe)', 
      'Housing', 'Transport', 'Other Allowance',
      'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)',
      'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)',
      'Employee Pension Deduction',
      'Total Net (Salary, OI, CA, TA, OI & PB)',
      'Working Days', 'Worked Days'
    ],
    canonicalHeaders: {
      's/n': 'S/N',
      'month': 'Month',
      'staff id': 'Staff ID',
      'name': 'Name',
      'country': 'Country',
      'state': 'State',
      'city': 'City',
      'region': 'Region',
      'business line': 'Business Line',
      'position verify (coe)': 'Position verify (coe)',
      'resumption date': 'Resumption Date',
      'exit date': 'Exit Date',
      'working<br>days': 'Working Days',
      'working days': 'Working Days',
      'workingdays': 'Working Days',
      'working_days': 'Working Days',
      'working-days': 'Working Days',
      'worked<br>days': 'Worked Days',
      'worked days': 'Worked Days',
      'workeddays': 'Worked Days',
      'worked_days': 'Worked Days',
      'worked-days': 'Worked Days',
      'basic salary before verify(coe)': 'Basic Salary before Verify(coe)',
      'basic salary adjustment difference': 'basic Salary adjustment difference',
      'target performance bonus before verify(coe)': 'Target Performance Bonus before Verify(coe)',
      'hmo': 'HMO',
      'this month\'s gross': 'This Month\'s Gross',
      'overtime income (oi)': 'Overtime Income (OI)',
      'communication allowance (ca)': 'Communication Allowance (CA)',
      'transportation allowance (ta)': 'Transportation Allowance (TA)',
      'outstanding income (oi)': 'Outstanding Income (OI)',
      'performance bonus (pb)': 'Performance Bonus (PB)',
      'basic': 'Basic',
      'housing': 'Housing',
      'transport': 'Transport',
      'other allowance': 'Other Allowance',
      'final gross this month (salary + oi + ca + ta + oi)': 'Final Gross This Month (Salary + OI + CA + TA + OI)',
      'final gross performance bonus this month': 'Final Gross Performance Bonus This Month',
      'final gross income this month (salary, oi, ca, ta, oi & pb)': 'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)',
      'gross monthly (salary, oi, ca, ta, oi) for crs purpose': 'Gross Monthly (Salary, OI, CA, TA, OI) for CRS Purpose',
      'gross performance bonus for crs purpose': 'Gross Performance Bonus for CRS Purpose',
      'consolidated relief allowance (salary, oi, ca, ta, oi)': 'Consolidated Relief Allowance (Salary, OI, CA, TA, OI)',
      'consolidated relief allowance (salary, oi, ca, ta, oi + perfomance bonus)': 'Consolidated Relief Allowance (Salary, OI, CA, TA, OI + Perfomance Bonus)',
      'employee pension deduction': 'Employee Pension Deduction',
      'total non-taxable income & tax exempt item': 'Total Non-Taxable Income & Tax Exempt Item',
      'total reliefs and deductions (salary, oi, ca, ta, oi)': 'Total Reliefs and Deductions (Salary, OI, CA, TA, OI)',
      'total reliefs and deductions (salary, oi, ca, ta, oi & pb)': 'Total Reliefs and Deductions (Salary, OI, CA, TA, OI & PB)',
      'taxable income - (salary, oi, ca, ta, oi)': 'Taxable Income - (Salary, OI, CA, TA, OI)',
      'taxable income - (salary, oi, ca, ta, oi & pb)': 'Taxable Income - (Salary, OI, CA, TA, OI & PB)',
      'tax payable this month (salary, oi, ca, ta oi)': 'Tax Payable This Month (Salary, OI, CA, TA OI)',
      'tax payable this month (salary, oi, ca, ta, oi & pb)': 'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)',
      'performance bonus tax': 'Performance Bonus Tax',
      'net (salary, oi, ca, ta, oi)': 'Net (Salary, OI, CA, TA, OI)',
      'net performance bonus': 'Net Performance Bonus',
      'penalty & deductions (after tax)': 'Penalty & Deductions (After Tax)',
      'total net (salary, oi, ca, ta, oi & pb)': 'Total Net (Salary, OI, CA, TA, OI & PB)',
      'employer pension contribution': 'Employer Pension Contribution',
      'eca': 'ECA',
      'management fees': 'Management Fees',
      'vat on management fees': 'VAT on Management Fees',
      'total cost': 'Total Cost',
      'wht on management fee': 'WHT on Management Fee',
      'sum payable': 'Sum Payable',
      'total cost($)': 'Total Cost(N)',
      'active or not': 'active or not',
      'pay opay': 'Pay OPay',
      'bank payment': 'Bank Payment',
      'submitter': 'Submitter',
      'opay account': 'OPay Account',
      'bvn': 'BVN',
      'bank name': 'Bank Name',
      'account name': 'Account Name',
      'account number': 'Account Number',
      'hr agency': 'HR Agency',
      'ba': 'BA',
      'pfa number': 'PFA Number',
      'email': 'Email'
    },
    displaySections: {
      earnings: [
        { displayName: 'Basic Salary', sourceField: 'basicSalary', conditional: false },
        { displayName: 'Housing Allowance', sourceField: 'housingAllowance', conditional: false },
        { displayName: 'Transport Allowance', sourceField: 'transportAllowance', conditional: false },
        { displayName: 'Overtime Income (OI)', sourceField: 'overtimeIncome', conditional: true },
        { displayName: 'Communication Allowance (CA)', sourceField: 'communicationAllowance', conditional: true },
        { displayName: 'Transportation Allowance (TA)', sourceField: 'transportationAllowance', conditional: true },
        { displayName: 'Outstanding Income (OI)', sourceField: 'outstandingIncome', conditional: true },
        { displayName: 'Other Allowances', sourceField: 'otherAllowances', conditional: true },
        { displayName: 'Performance Bonus (PB)', sourceField: 'bonusKPI', conditional: true }
      ],
      deductions: [
        { displayName: 'PAYE Tax', sourceField: 'payee', conditional: false },
        { displayName: 'Pension Contribution', sourceField: 'pension', conditional: false },
        { displayName: 'Penalty & Deductions', sourceField: 'deductions', conditional: true }
      ]
    }
  }
};

// Helper function to check if a template is fixed (non-dynamic)
export function isFixedTemplate(type: string): boolean {
  return type === 'ISURF_STANDARD' || type === 'BLUERIDGE';
}

// Helper function to get template config
export function getTemplateConfig(type: PayrollTemplateType): TemplateConfig | null {
  if (type === 'DYNAMIC') return null;
  return PAYROLL_TEMPLATES[type];
}

// Helper function to validate template type
export function isValidTemplateType(type: string): type is PayrollTemplateType {
  return type === 'ISURF_STANDARD' || type === 'BLUERIDGE' || type === 'DYNAMIC';
}

// Helper function to create a payslip display item from custom field
export function createPayslipItemFromCustomField(
  field: CustomFieldValue,
  type: 'earnings' | 'deduction'
): PayslipDisplayItem {
  return {
    label: field.displayName,
    value: typeof field.value === 'number' ? field.value : Number(field.value) || 0,
    type,
    dataType: field.dataType,
    isCustom: true,
    section: field.section
  };
}

// Helper function to calculate totals from payslip items
export function calculatePayslipTotals(
  earnings: PayslipDisplayItem[],
  deductions: PayslipDisplayItem[]
): { grossPay: number; totalDeductions: number; netPay: number } {
  const grossPay = earnings.reduce((sum, item) => sum + item.value, 0);
  const totalDeductions = deductions.reduce((sum, item) => sum + item.value, 0);
  const netPay = grossPay - totalDeductions;
  
  return { grossPay, totalDeductions, netPay };
}