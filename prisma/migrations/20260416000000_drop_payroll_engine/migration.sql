-- Drop Payroll Engine Module
-- Removes all tables, indexes, and enums belonging to the payroll-engine module.
-- No other tables or columns are affected.

-- Drop dependent tables first (foreign key order)
DROP TABLE IF EXISTS "computed_payslips" CASCADE;
DROP TABLE IF EXISTS "pay_validations" CASCADE;
DROP TABLE IF EXISTS "overtime_entries" CASCADE;
DROP TABLE IF EXISTS "deduction_entries" CASCADE;
DROP TABLE IF EXISTS "tax_filing_schedules" CASCADE;
DROP TABLE IF EXISTS "annual_returns" CASCADE;
DROP TABLE IF EXISTS "tax_profile_uploads" CASCADE;
DROP TABLE IF EXISTS "employee_tax_profiles" CASCADE;
DROP TABLE IF EXISTS "employee_salaries" CASCADE;
DROP TABLE IF EXISTS "pay_periods" CASCADE;

-- Drop payroll-engine enums
DROP TYPE IF EXISTS "PayPeriodStatus";
DROP TYPE IF EXISTS "ValidationStatus";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "EmployeeCategory";
DROP TYPE IF EXISTS "DeductionType";
DROP TYPE IF EXISTS "ReportType";
DROP TYPE IF EXISTS "FilingStatus";
