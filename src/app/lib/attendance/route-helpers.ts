// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import { addBusinessDays, isBusinessWeekday } from '@/app/lib/attendance/business-day'

type AttendanceStatus = "PRESENT" | "LATE" | "PARTIAL" | "ABSENT";

export function deriveAttendanceStatus(record: {
  status: string | null;
  signInTime: Date | null;
}): AttendanceStatus {
  if (!record.signInTime) return "ABSENT";
  if (record.status === "LATE") return "LATE";
  if (record.status === "HALF_DAY" || record.status === "PARTIAL") return "PARTIAL";
  return "PRESENT";
}

export function getBusinessDaysCount(startDate: Date, endDate: Date): number {
  let count = 0;
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    if (isBusinessWeekday(current)) count++;
    current = addBusinessDays(current, 1);
  }

  return count;
}
