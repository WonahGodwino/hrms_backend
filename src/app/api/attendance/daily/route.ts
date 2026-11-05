// src/app/api/attendance/daily/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { requireModuleAccess } from "@/app/lib/module-access";
import { withCors, handleCorsOptions } from "@/app/lib/cors";
import { canManageAttendance } from "@/app/lib/attendance/access";
import { startOfBusinessDay, businessDateKey, addBusinessDays } from "@/app/lib/attendance/business-day";
import { ensureHolidayAttendance, HOLIDAY_METHOD, getWorkSettings, checkClockOutWindow } from "@/app/lib/attendance/work-calendar";
import { fillMissingAddresses, parseClockLocation, signInLocationData, signOutLocationData, locationView, LOCATION_REQUIRED_MESSAGE } from "@/app/lib/attendance/clock-location";
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
    // Dynamically import Prisma to avoid issues during build
    const { prisma } = await import("@/app/lib/prisma");
    
    // 1. Authenticate the ADMIN/HR/SUPER_ADMIN user who is operating the interface
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const response = NextResponse.json(
        { success: false, message: "Authorization header missing" }, 
        { status: 401 }
      );
      return withCors(response, origin);
    }
    
    const token = authHeader.replace("Bearer ", "");
    const adminUser = await requireModuleAccess(token, 'ATTENDANCE', ["HR", "SUPER_ADMIN", "ADMIN"]);
    
    // 2. Parse request body
    const body = await req.json();
    const { 
      companyId, 
      identifier, 
      method = "staff_id" 
    } = body as {
      companyId: string;
      identifier: string;
      method: "staff_id" | "email" | "barcode";
    };

    // 3. Validate required fields
    if (!companyId || !identifier) {
      const response = NextResponse.json(
        { 
          success: false, 
          message: "Company ID and staff identifier are required" 
        }, 
        { status: 400 }
      );
      return withCors(response, origin);
    }

    // 4. Validate admin user has access to this company
    const hasAccess = await validateCompanyAccess(adminUser, companyId);
    if (!hasAccess) {
      const response = NextResponse.json(
        { 
          success: false, 
          message: "You do not have access to record attendance for this company" 
        }, 
        { status: 403 }
      );
      return withCors(response, origin);
    }

    // 5. Find the staff member who is signing in/out
    const staff = await prisma.staffRecord.findFirst({
      where: {
        companyId,
        isActive: true,
        OR: buildIdentifierQuery(identifier, method),
      },
      select: { 
        id: true, 
        staffId: true, 
        email: true, 
        firstName: true, 
        lastName: true,
        position: true,
        department: true,
        companyId: true,
        encodedId: true,
      },
    });

    if (!staff) {
      const response = NextResponse.json(
        { 
          success: false, 
          message: "Staff member not found or inactive",
          suggestions: await getSimilarStaff(companyId, identifier)
        }, 
        { status: 404 }
      );
      return withCors(response, origin);
    }

    // 6. Get today's date
    const today = startOfDay();
    const now = new Date();

    // Holidays: everyone is clocked in/out automatically (work-calendar.ts).
    await ensureHolidayAttendance(companyId, now);

    // 7. Check for existing attendance record today
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        companyId,
        staffId: staff.id,
        date: today,
      },
      orderBy: {
        signInTime: 'desc'
      }
    });

    // Already a full in/out today (or a holiday auto-entry) — creating another
    // row would violate the companyId+staffId+date unique key.
    if (existingAttendance?.signOutTime) {
      const isHoliday = existingAttendance.method === HOLIDAY_METHOD;
      const response = NextResponse.json(
        {
          success: false,
          code: isHoliday ? 'HOLIDAY' : 'ALREADY_COMPLETE',
          message: isHoliday
            ? `Today is a holiday (${existingAttendance.notes?.replace(/^Holiday:\s*/, '') || 'holiday'}). ${staff.firstName} ${staff.lastName} was clocked in and out automatically.`
            : `${staff.firstName} ${staff.lastName} has already signed in and out today`,
        },
        { status: 409 }
      );
      return withCors(response, origin);
    }

    // Compliance: the recorder's device location is saved with every entry;
    // without one the action is refused (clock-location.ts).
    const location = parseClockLocation(body);
    if (!location) {
      const response = NextResponse.json({ success: false, code: 'LOCATION_REQUIRED', message: LOCATION_REQUIRED_MESSAGE }, { status: 400 });
      return withCors(response, origin);
    }

    let attendanceRecord;
    let action: 'SIGN_IN' | 'SIGN_OUT';
    let message: string;
    const settings = await getWorkSettings(companyId);

    if (existingAttendance && existingAttendance.signInTime && !existingAttendance.signOutTime) {
      // 8. Staff is signing OUT (already signed in today) — only allowed
      // from closing time onward, not before.
      const windowCheck = checkClockOutWindow(settings, now);
      if (!windowCheck.allowed) {
        const response = NextResponse.json(
          {
            success: false,
            code: 'BEFORE_CLOSING',
            message: `${staff.firstName} ${staff.lastName} can't be clocked out before closing time (${windowCheck.closesAt})`,
          },
          { status: 403 }
        );
        return withCors(response, origin);
      }
      attendanceRecord = await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          signOutTime: now,
          recordedById: adminUser.userId,
          recordedByRole: adminUser.role,
          method,
          updatedAt: now,
          ...(await signOutLocationData(location)),
        },
      });
      action = 'SIGN_OUT';
      message = `${staff.firstName} ${staff.lastName} signed out successfully`;
      
    } else {
      // 9. Staff is signing IN (no sign-in today or already signed out).
      // No time restriction here — early or late is always accepted, but a
      // sign-in past the grace period is recorded as LATE.
      const late = isLate({ standardStartTime: settings.startTime, lateGraceMinutes: settings.lateGraceMinutes }, now);

      // Check if there was a sign-in today but staff forgot to sign out yesterday
      const previousDayAttendance = await prisma.attendance.findFirst({
        where: {
          companyId,
          staffId: staff.id,
          date: startOfDay(new Date(Date.now() - 24 * 60 * 60 * 1000)), // Yesterday
          signOutTime: null,
        },
      });

      if (previousDayAttendance) {
        // Auto-signout from previous day
        await prisma.attendance.update({
          where: { id: previousDayAttendance.id },
          data: {
            signOutTime: startOfDay(), // Set to start of today
            updatedAt: now,
            notes: "Auto-signed out from previous day",
          },
        });
      }

      // Create new sign-in record
      attendanceRecord = await prisma.attendance.create({
        data: {
          companyId,
          staffId: staff.id,
          date: today,
          signInTime: now,
          recordedById: adminUser.userId,
          recordedByRole: adminUser.role,
          method,
          status: late ? 'LATE' : 'PRESENT',
          ...(await signInLocationData(location)),
        },
      });
      action = 'SIGN_IN';
      message = late
        ? `${staff.firstName} ${staff.lastName} signed in successfully (recorded as late)`
        : `${staff.firstName} ${staff.lastName} signed in successfully`;
    }

    // 10. Return success response
    const response = NextResponse.json({
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
          createdAt: attendanceRecord.createdAt,
          updatedAt: attendanceRecord.updatedAt,
        },
        staff: {
          id: staff.id,
          staffId: staff.staffId,
          name: `${staff.firstName} ${staff.lastName}`,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          position: staff.position,
          department: staff.department,
          companyId: staff.companyId,
        },
        recordedBy: {
          id: adminUser.userId,
          role: adminUser.role,
          name: adminUser.email, // Using email since name doesn't exist in AuthUser
        },
        companyId,
      },
    });
    
    return withCors(response, origin);

  } catch (error: any) {
    console.error("Attendance recording error:", error);
    
    // Handle specific errors
    let statusCode = 500;
    let errorMessage = "Internal server error";
    
    if (error.code === 'P2002') {
      statusCode = 409;
      errorMessage = "Duplicate attendance record";
    } else if (error.code === 'P2025') {
      statusCode = 404;
      errorMessage = "Record not found";
    }

    const response = NextResponse.json(
      { 
        success: false, 
        message: errorMessage,
        ...(process.env.NODE_ENV === "development" && { error: error.message })
      }, 
      { status: statusCode }
    );
    return withCors(response, origin);
  }
}

// GET endpoint to view today's attendance
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
    const user = await requireModuleAccess(token, 'ATTENDANCE', ["HR", "SUPER_ADMIN", "ADMIN"]);
    
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const date = searchParams.get("date") || new Date().toISOString().split('T')[0];
    
    if (!companyId) {
      const response = NextResponse.json(
        { success: false, message: "Company ID is required" }, 
        { status: 400 }
      );
      return withCors(response, origin);
    }

    // Validate access
    const hasAccess = await validateCompanyAccess(user, companyId);
    if (!hasAccess) {
      const response = NextResponse.json(
        { success: false, message: "No access to this company" }, 
        { status: 403 }
      );
      return withCors(response, origin);
    }

    const targetDate = startOfDay(new Date(date));

    // Holiday auto-attendance for the day being viewed (no-op otherwise).
    await ensureHolidayAttendance(companyId, targetDate);
    
    // Get attendance for the day
    const attendance = await prisma.attendance.findMany({
      where: {
        companyId,
        date: targetDate,
      },
      include: {
        staffRecord: {
          select: {
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            position: true,
            department: true,
          }
        }
      },
      orderBy: {
        signInTime: 'desc'
      }
    });

    // Get stats
    const totalStaff = await prisma.staffRecord.count({
      where: {
        companyId,
        isActive: true,
      }
    });

    // Make sure every clock-in / clock-out location shows a real address
    await fillMissingAddresses(attendance);

    const signedInToday = attendance.filter(a => a.signInTime && !a.signOutTime).length;
    const signedOutToday = attendance.filter(a => a.signOutTime).length;

    const response = NextResponse.json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        stats: {
          totalStaff,
          signedInToday,
          signedOutToday,
          pending: totalStaff - signedInToday - signedOutToday,
        },
        attendance: attendance.map(record => ({
          id: record.id,
          signInAt: record.signInTime,
          signOutAt: record.signOutTime,
          method: record.method,
          location: locationView(record),
          staff: record.staffRecord,
        }))
      }
    });
    
    return withCors(response, origin);

  } catch (error: any) {
    console.error("Attendance fetch error:", error);
    const response = NextResponse.json(
      { success: false, message: "Failed to fetch attendance" }, 
      { status: 500 }
    );
    return withCors(response, origin);
  }
}

// Helper function to build identifier query
function buildIdentifierQuery(identifier: string, method: string) {
  const query = [];
  const normalizedIdentifier = identifier.toLowerCase().trim();
  
  switch (method) {
    case 'email':
      query.push({ email: normalizedIdentifier });
      break;
    case 'barcode':
      query.push({ encodedId: identifier });
      query.push({ staffId: identifier }); // Also check staffId for barcode
      break;
    case 'staff_id':
    default:
      query.push({ staffId: identifier });
      // Also check email in case user entered email with staff_id method
      if (identifier.includes('@')) {
        query.push({ email: normalizedIdentifier });
      }
      break;
  }
  
  return query;
}

// Helper function to validate company access
async function validateCompanyAccess(user: any, companyId: string): Promise<boolean> {
  // One rule for the whole attendance module (lib/attendance/access.ts):
  // company membership incl. multi-company HR/ADMIN + Attendance enabled
  // for that company, so the company switcher scopes everything.
  return canManageAttendance(user, companyId);
}

// Helper function to suggest similar staff
async function getSimilarStaff(companyId: string, identifier: string) {
  try {
    const { prisma } = await import("@/app/lib/prisma");
    
    const similarStaff = await prisma.staffRecord.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [
          { staffId: { contains: identifier, mode: 'insensitive' } },
          { email: { contains: identifier, mode: 'insensitive' } },
          { firstName: { contains: identifier, mode: 'insensitive' } },
          { lastName: { contains: identifier, mode: 'insensitive' } },
        ]
      },
      take: 5,
      select: {
        staffId: true,
        firstName: true,
        lastName: true,
        email: true,
      }
    });
    
    return similarStaff.map(staff => ({
      staffId: staff.staffId,
      name: `${staff.firstName} ${staff.lastName}`,
      email: staff.email,
    }));
  } catch {
    return [];
  }
}