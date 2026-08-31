-- Attendance lateness rule, configurable per company for Attendance
-- Reporting. Both nullable/defaulted — no effect on any existing company
-- until it's explicitly configured via the new settings form in the Leave
-- module (LeavePolicy.jsx). Application code falls back to "09:00"/0
-- minutes when null, matching the previous hardcoded client-side default.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "standardStartTime" VARCHAR(5);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "lateGraceMinutes" INTEGER DEFAULT 0;
