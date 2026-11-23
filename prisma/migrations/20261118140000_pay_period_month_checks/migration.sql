-- DB-004 step 3 (owner-approved 2026-11-18): pay-period columns may only hold
-- month names ("October") and "Month YYYY" periods ("October 2026").
-- A read-only check of production on 2026-11-18 found only such values.
-- The application normalises "10" / "Oct" to the name before writing
-- (toMonthName in lib/payroll/utils/valueParsing.ts).
-- Prisma does not model CHECK constraints, so this file is hand-written;
-- each constraint is added only if it does not exist yet.

DO $$
DECLARE
  months CONSTANT text := '(''January'',''February'',''March'',''April'',''May'',''June'',''July'',''August'',''September'',''October'',''November'',''December'')';
  period CONSTANT text := '''^(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{4}$''';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payrolls_month_name_check') THEN
    EXECUTE 'ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_month_name_check" CHECK ("month" IN ' || months || ')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payslips_month_name_check') THEN
    EXECUTE 'ALTER TABLE "payslips" ADD CONSTRAINT "payslips_month_name_check" CHECK ("month" IN ' || months || ')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payslip_bulk_sends_month_name_check') THEN
    EXECUTE 'ALTER TABLE "payslip_bulk_sends" ADD CONSTRAINT "payslip_bulk_sends_month_name_check" CHECK ("month" IN ' || months || ')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_offer_letters_month_name_check') THEN
    EXECUTE 'ALTER TABLE "generated_offer_letters" ADD CONSTRAINT "generated_offer_letters_month_name_check" CHECK ("month" IN ' || months || ')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_data_pay_period_check') THEN
    EXECUTE 'ALTER TABLE "payroll_data" ADD CONSTRAINT "payroll_data_pay_period_check" CHECK ("payPeriod" ~ ' || period || ')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_generation_runs_pay_period_check') THEN
    EXECUTE 'ALTER TABLE "payroll_generation_runs" ADD CONSTRAINT "payroll_generation_runs_pay_period_check" CHECK ("payPeriod" ~ ' || period || ')';
  END IF;
END $$;
