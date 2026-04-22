import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { withCors, handleCorsOptions } from "@/app/lib/cors";

type AuthUser = {
  userId: string;
  role: string;
  companyId?: string;
  email?: string;
};

type AttendanceStatus = "PRESENT" | "LATE" | "PARTIAL" | "ABSENT";

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function parseDateInput(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return startOfDay(parsed);
}

function toDateKey(date: Date): string {
  return startOfDay(date).toISOString().split("T")[0];
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getDatesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = startOfDay(start);
  const last = startOfDay(end);

  while (current <= last) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function normalizeSelectedDates(searchParams: URLSearchParams): Date[] {
  const rawValues = [
    ...searchParams.getAll("dates"),
    ...searchParams.getAll("selectedDates"),
  ];

  const expandedValues = rawValues
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  const uniqueDates = new Map<string, Date>();

  expandedValues.forEach((value) => {
    const parsed = parseDateInput(value);
    if (!parsed) {
      return;
    }

    uniqueDates.set(toDateKey(parsed), parsed);
  });

  return Array.from(uniqueDates.values()).sort((left, right) => left.getTime() - right.getTime());
}

function deriveAttendanceStatus(record: { status: string | null; signInTime: Date | null }): AttendanceStatus {
  if (!record.signInTime) {
    return "ABSENT";
  }

  if (record.status === "LATE") {
    return "LATE";
  }

  if (record.status === "HALF_DAY" || record.status === "PARTIAL") {
    return "PARTIAL";
  }

  return "PRESENT";
}

function resolveDateSelection(searchParams: URLSearchParams): {
  selectedDates: Date[];
  isCustomSelection: boolean;
} {
  const explicitDates = normalizeSelectedDates(searchParams);
  if (explicitDates.length > 0) {
    return {
      selectedDates: explicitDates,
      isCustomSelection: true,
    };
  }

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (startDate && endDate) {
    const parsedStart = parseDateInput(startDate);
    const parsedEnd = parseDateInput(endDate);

    if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) {
      throw new Error("INVALID_DATE_RANGE");
    }

    return {
      selectedDates: getDatesInRange(parsedStart, parsedEnd),
      isCustomSelection: true,
    };
  }

  const singleDate = searchParams.get("date");
  if (singleDate) {
    const parsedDate = parseDateInput(singleDate);
    if (!parsedDate) {
      throw new Error("INVALID_SINGLE_DATE");
    }

    return {
      selectedDates: [parsedDate],
      isCustomSelection: true,
    };
  }

  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const now = new Date();
  const targetYear = year ? Number.parseInt(year, 10) : now.getFullYear();
  const targetMonth = month ? Number.parseInt(month, 10) - 1 : now.getMonth();

  if (
    Number.isNaN(targetYear) ||
    Number.isNaN(targetMonth) ||
    targetMonth < 0 ||
    targetMonth > 11
  ) {
    throw new Error("INVALID_MONTH_YEAR");
  }

  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 0);

  return {
    selectedDates: getDatesInRange(monthStart, monthEnd),
    isCustomSelection: false,
  };
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const { prisma } = await import("@/app/lib/prisma");

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const response = NextResponse.json(
        { success: false, message: "Authorization header missing" },
        { status: 401 }
      );
      return withCors(response, origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN", "STAFF"]) as AuthUser;

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    let staffRecordId = searchParams.get("staffRecordId");
    const staffId = searchParams.get("staffId");
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (user.role === "STAFF" && !staffRecordId && !staffId && !email) {
      staffRecordId = user.userId;
    }

    if (!companyId) {
      const response = NextResponse.json(
        { success: false, message: "Company ID is required" },
        { status: 400 }
      );
      return withCors(response, origin);
    }

    if (!staffRecordId && !staffId && !email) {
      const response = NextResponse.json(
        {
          success: false,
          message: "One of staffRecordId, staffId, or email is required",
        },
        { status: 400 }
      );
      return withCors(response, origin);
    }

    const hasAccess = await validateCompanyAccess(user, companyId);
    if (!hasAccess) {
      const response = NextResponse.json(
        { success: false, message: "No access to this company" },
        { status: 403 }
      );
      return withCors(response, origin);
    }

    let selection;
    try {
      selection = resolveDateSelection(searchParams);
    } catch (error: any) {
      const message =
        error.message === "INVALID_DATE_RANGE"
          ? "Invalid date range. Use valid YYYY-MM-DD values and ensure startDate is not after endDate"
          : error.message === "INVALID_SINGLE_DATE"
            ? "Invalid date. Use YYYY-MM-DD"
            : "Invalid month or year";

      const response = NextResponse.json(
        { success: false, message },
        { status: 400 }
      );
      return withCors(response, origin);
    }

    const selectedDates = selection.selectedDates;
    if (selectedDates.length === 0) {
      const response = NextResponse.json(
        { success: false, message: "At least one valid date must be provided" },
        { status: 400 }
      );
      return withCors(response, origin);
    }

    const staff = await prisma.staffRecord.findFirst({
      where: {
        companyId,
        isActive: true,
        OR: [
          ...(staffRecordId ? [{ id: staffRecordId }] : []),
          ...(staffId ? [{ staffId }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: {
        id: true,
        staffId: true,
        email: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        companyId: true,
      },
    });

    if (!staff) {
      const response = NextResponse.json(
        { success: false, message: "Staff member not found or inactive" },
        { status: 404 }
      );
      return withCors(response, origin);
    }

    if (user.role === "STAFF" && staff.id !== user.userId) {
      const response = NextResponse.json(
        { success: false, message: "Staff can only view their own attendance" },
        { status: 403 }
      );
      return withCors(response, origin);
    }

    const rangeStart = startOfDay(selectedDates[0]);
    const rangeEnd = endOfDay(selectedDates[selectedDates.length - 1]);

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        companyId,
        staffId: staff.id,
        date: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
      orderBy: [
        { date: "desc" },
        { signInTime: "desc" },
      ],
    });

    const selectedDateKeys = new Set(selectedDates.map((date) => toDateKey(date)));
    const selectedRecords = attendanceRecords.filter((record) => selectedDateKeys.has(toDateKey(record.date)));
    const recordsByDate = new Map(selectedRecords.map((record) => [toDateKey(record.date), record]));

    const summary = {
      present: 0,
      late: 0,
      partial: 0,
      absent: 0,
      totalSelectedDays: selectedDates.length,
      selectedBusinessDays: selectedDates.filter(isBusinessDay).length,
      recordsFound: selectedRecords.length,
    };

    const calendar = selectedDates.map((date) => {
      const dateKey = toDateKey(date);
      const record = recordsByDate.get(dateKey) || null;
      const status = record ? deriveAttendanceStatus(record) : "ABSENT";

      if (status === "PRESENT") {
        summary.present += 1;
      } else if (status === "LATE") {
        summary.late += 1;
      } else if (status === "PARTIAL") {
        summary.partial += 1;
      } else {
        summary.absent += 1;
      }

      return {
        date: dateKey,
        dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
        isBusinessDay: isBusinessDay(date),
        status,
        attendanceId: record?.id ?? null,
        signInAt: record?.signInTime ?? null,
        signOutAt: record?.signOutTime ?? null,
        method: record?.method ?? null,
        rawStatus: record?.status ?? null,
      };
    });

    const denominator = summary.selectedBusinessDays > 0 ? summary.selectedBusinessDays : summary.totalSelectedDays;
    const attendedDays = summary.present + summary.late + summary.partial;

    const response = NextResponse.json({
      success: true,
      data: {
        staff: {
          id: staff.id,
          staffId: staff.staffId,
          email: staff.email,
          name: `${staff.firstName} ${staff.lastName}`,
          firstName: staff.firstName,
          lastName: staff.lastName,
          department: staff.department,
          position: staff.position,
          companyId: staff.companyId,
        },
        filters: {
          companyId,
          staffRecordId: staff.id,
          requestedStaffId: staffId,
          requestedEmail: email ?? null,
          selectedDates: selectedDates.map((date) => toDateKey(date)),
          startDate: toDateKey(rangeStart),
          endDate: toDateKey(rangeEnd),
          isCustomSelection: selection.isCustomSelection,
        },
        summary: {
          ...summary,
          attendedDays,
          attendanceRate: denominator > 0 ? Number(((attendedDays / denominator) * 100).toFixed(2)) : 0,
        },
        chart: {
          present: summary.present,
          late: summary.late,
          partial: summary.partial,
          absent: summary.absent,
        },
        calendar,
        recentAttendanceHistory: selectedRecords.map((record) => ({
          id: record.id,
          date: toDateKey(record.date),
          signInAt: record.signInTime,
          signOutAt: record.signOutTime,
          method: record.method,
          status: deriveAttendanceStatus(record),
          rawStatus: record.status,
          notes: record.notes,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })),
      },
    });

    return withCors(response, origin);
  } catch (error: any) {
    console.error("Staff attendance fetch error:", error);

    const response = NextResponse.json(
      { success: false, message: "Failed to fetch staff attendance" },
      { status: 500 }
    );

    return withCors(response, origin);
  }
}

async function validateCompanyAccess(user: AuthUser, companyId: string): Promise<boolean> {
  const { prisma } = await import("@/app/lib/prisma");

  if (user.role === "SUPER_ADMIN") {
    return true;
  }

  if (user.role === "HR") {
    return user.companyId === companyId;
  }

  if (user.role === "ADMIN") {
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId,
        role: { in: ["ADMIN", "ALL"] },
      },
    });

    return !!userCompany;
  }

  if (user.role === "STAFF") {
    return user.companyId === companyId;
  }

  return false;
}