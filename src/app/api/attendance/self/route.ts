// src/app/api/attendance/self/route.ts
//
// Self-service attendance: a staff member clocking their OWN sign-in/sign-out,
// as opposed to attendance/daily/route.ts which is an HR/Admin operator
// marking someone ELSE's attendance by identifier. Same toggle logic (sign in
// if no open record today, sign out if one is open), method is always "self"
// and recordedById/recordedByRole are always the caller's own — there is no
// identifier lookup since the subject is always the authenticated user.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { withCors, handleCorsOptions } from "@/app/lib/cors";
import { startOfBusinessDay, businessDateKey } from "@/app/lib/attendance/business-day";
import { ensureHolidayAttendance, HOLIDAY_METHOD, getWorkSettings, checkClockOutWindow } from "@/app/lib/attendance/work-calendar";
import { parseClockLocation, signInLocationData, signOutLocationData, locationView, LOCATION_REQUIRED_MESSAGE } from "@/app/lib/attendance/clock-location";
import { isLate } from "@/app/lib/attendance/lateness";

// Business-day-aware (Africa/Lagos, not server-local) — see business-day.ts.
const startOfDay = startOfBusinessDay;
const toDateKey = businessDateKey;

type AttendanceStatus = "PRESENT" | "LATE" | "PARTIAL" | "ABSENT";

function deriveAttendanceStatus(record: {
  status: string | null;
  signInTime: Date | null;
}): AttendanceStatus {
  if (!record.signInTime) return "ABSENT";
  if (record.status === "LATE") return "LATE";
  if (record.status === "HALF_DAY" || record.status === "PARTIAL") return "PARTIAL";
  return "PRESENT";
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const { prisma } = await import("@/app/lib/prisma");

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return withCors(NextResponse.json({ success: false, message: "Authorization header missing" }, { status: 401 }), origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const user = requireRole(token, ["STAFF", "HR", "ADMIN", "SUPER_ADMIN"]) as { userId: string; role: string; companyId?: string; email?: string };

    if (!user.companyId) {
      return withCors(NextResponse.json({ success: false, message: "Your account has no company assigned" }, { status: 400 }), origin);
    }
    const companyId = user.companyId;

    const staff = await prisma.staffRecord.findFirst({
      where: { id: user.userId, companyId, isActive: true },
      select: { id: true, staffId: true, email: true, firstName: true, lastName: true, position: true, department: true, companyId: true },
    });

    if (!staff) {
      return withCors(NextResponse.json({ success: false, message: "Staff record not found or inactive" }, { status: 404 }), origin);
    }

    const today = startOfDay();
    const now = new Date();

    // Holidays: everyone is clocked in/out automatically (work-calendar.ts).
    // Materialise today's rows first so a holiday is reported clearly below.
    await ensureHolidayAttendance(companyId, now);

    const existingAttendance = await prisma.attendance.findFirst({
      where: { companyId, staffId: staff.id, date: today },
      orderBy: { signInTime: "desc" },
    });

    if (existingAttendance?.method === HOLIDAY_METHOD) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            code: "HOLIDAY",
            message: `Today is a holiday (${existingAttendance.notes?.replace(/^Holiday:\s*/, "") || "holiday"}). You have been clocked in and out automatically.`,
            data: {
              attendance: {
                id: existingAttendance.id,
                date: toDateKey(existingAttendance.date),
                signInAt: existingAttendance.signInTime,
                signOutAt: existingAttendance.signOutTime,
                method: existingAttendance.method,
                status: deriveAttendanceStatus(existingAttendance),
              },
            },
          },
          { status: 409 }
        ),
        origin
      );
    }

    // Compliance: every self clock-in/out records the device's location;
    // without one the action is refused (clock-location.ts).
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const location = parseClockLocation(body);
    if (!location) {
      return withCors(NextResponse.json({ success: false, code: "LOCATION_REQUIRED", message: LOCATION_REQUIRED_MESSAGE }, { status: 400 }), origin);
    }

    let attendanceRecord;
    let action: "SIGN_IN" | "SIGN_OUT";
    let message: string;
    const settings = await getWorkSettings(companyId);

    // Clocking out is only allowed from closing time onward — not before.
    if (existingAttendance && existingAttendance.signInTime && !existingAttendance.signOutTime) {
      const windowCheck = checkClockOutWindow(settings, now);
      if (!windowCheck.allowed) {
        return withCors(
          NextResponse.json(
            {
              success: false,
              code: "BEFORE_CLOSING",
              message: `You can't clock out before closing time (${windowCheck.closesAt}).`,
            },
            { status: 403 }
          ),
          origin
        );
      }
      attendanceRecord = await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          signOutTime: now,
          recordedById: staff.id,
          recordedByRole: user.role,
          method: "self",
          updatedAt: now,
          ...(await signOutLocationData(location)),
        },
      });
      action = "SIGN_OUT";
      message = "You signed out successfully";
    } else if (existingAttendance && existingAttendance.signOutTime) {
      // Already completed a full in/out cycle today — nothing more to record.
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: "You have already signed in and out today",
            data: {
              attendance: {
                id: existingAttendance.id,
                date: toDateKey(existingAttendance.date),
                signInAt: existingAttendance.signInTime,
                signOutAt: existingAttendance.signOutTime,
                status: deriveAttendanceStatus(existingAttendance),
              },
            },
          },
          { status: 409 }
        ),
        origin
      );
    } else {
      // Clock-IN has no time restriction — early or late is always accepted,
      // but a sign-in past the grace period is recorded as LATE.
      const late = isLate({ standardStartTime: settings.startTime, lateGraceMinutes: settings.lateGraceMinutes }, now);

      // Auto-signout from a previous day staff forgot to close out.
      const previousDayAttendance = await prisma.attendance.findFirst({
        where: { companyId, staffId: staff.id, date: startOfDay(new Date(Date.now() - 24 * 60 * 60 * 1000)), signOutTime: null },
      });
      if (previousDayAttendance) {
        await prisma.attendance.update({
          where: { id: previousDayAttendance.id },
          data: { signOutTime: startOfDay(), updatedAt: now, notes: "Auto-signed out from previous day" },
        });
      }

      attendanceRecord = await prisma.attendance.create({
        data: {
          companyId,
          staffId: staff.id,
          date: today,
          signInTime: now,
          recordedById: staff.id,
          recordedByRole: user.role,
          method: "self",
          status: late ? "LATE" : "PRESENT",
          ...(await signInLocationData(location)),
        },
      });
      action = "SIGN_IN";
      message = late ? "You signed in successfully (recorded as late)" : "You signed in successfully";
    }

    return withCors(
      NextResponse.json({
        success: true,
        message,
        data: {
          action,
          timestamp: now.toISOString(),
          attendance: {
            id: attendanceRecord.id,
            date: toDateKey(attendanceRecord.date),
            signInAt: attendanceRecord.signInTime,
            signOutAt: attendanceRecord.signOutTime,
            method: attendanceRecord.method,
            status: deriveAttendanceStatus(attendanceRecord),
            rawStatus: attendanceRecord.status,
            notes: attendanceRecord.notes,
            location: locationView(attendanceRecord),
          },
          staff: {
            id: staff.id,
            staffId: staff.staffId,
            name: `${staff.firstName} ${staff.lastName}`,
            firstName: staff.firstName,
            lastName: staff.lastName,
            position: staff.position,
            department: staff.department,
            companyId: staff.companyId,
          },
        },
      }),
      origin
    );
  } catch (error: any) {
    console.error("Self attendance recording error:", error);
    let statusCode = 500;
    let errorMessage = "Internal server error";
    if (error.code === "P2002") {
      statusCode = 409;
      errorMessage = "Duplicate attendance record";
    }
    return withCors(
      NextResponse.json({ success: false, message: errorMessage, ...(process.env.NODE_ENV === "development" && { error: error.message }) }, { status: statusCode }),
      origin
    );
  }
}
