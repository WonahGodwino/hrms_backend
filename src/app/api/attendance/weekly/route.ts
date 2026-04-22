import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { withCors, handleCorsOptions } from "@/app/lib/cors";

// Helper functions to get start and end of week (Monday to Sunday)
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() + (day === 0 ? 0 : 7 - day); // Adjust when day is Sunday
  d.setDate(diff);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Helper function to get start and end of week based on week offset
function getWeekDates(weekOffset: number = 0): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + (weekOffset * 7));
  return {
    start: startOfWeek(start),
    end: endOfWeek(start)
  };
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    // Dynamically import Prisma to avoid issues during build
    const { prisma } = await import("@/app/lib/prisma");

    // Authorization check
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const response = NextResponse.json({ 
        success: false, 
        message: "Authorization header missing" 
      }, { status: 401 });
      return withCors(response, origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const user = requireRole(token, ["HR", "ADMIN", "SUPER_ADMIN"]);

    // Get query parameters from URL
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    const weekOffset = parseInt(url.searchParams.get("week") || "0");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (!companyId) {
      const response = NextResponse.json({ 
        success: false, 
        message: "Company ID is required" 
      }, { status: 400 });
      return withCors(response, origin);
    }

    const hasAccess = await validateCompanyAccess(user, companyId);
    if (!hasAccess) {
      const response = NextResponse.json({
        success: false,
        message: "No access to this company"
      }, { status: 403 });
      return withCors(response, origin);
    }

    // Determine date range
    let dateRange: { start: Date; end: Date };
    
    if (startDate && endDate) {
      // Use custom date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        const response = NextResponse.json({ 
          success: false, 
          message: "Invalid date format. Use YYYY-MM-DD" 
        }, { status: 400 });
        return withCors(response, origin);
      }
      
      if (start > end) {
        const response = NextResponse.json({ 
          success: false, 
          message: "Start date must be before end date" 
        }, { status: 400 });
        return withCors(response, origin);
      }
      
      dateRange = { start, end };
    } else {
      // Use week offset (0 = current week, -1 = last week, 1 = next week)
      dateRange = getWeekDates(weekOffset);
    }

    // Fetch all active staff for the company
    const totalStaff = await prisma.staffRecord.count({
      where: {
        companyId,
        isActive: true,
      },
    });

    // Fetch weekly attendance data
    const attendance = await prisma.attendance.findMany({
      where: {
        companyId,
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      include: {
        staffRecord: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            position: true,
            department: true,
          },
        },
      },
      orderBy: [
        { date: 'desc' },
        { signInTime: 'desc' }
      ],
    });

    // Group attendance by day
    const attendanceByDay: Record<string, any[]> = {};
    const daysInRange = getDaysInRange(dateRange.start, dateRange.end);
    
    // Initialize empty arrays for each day
    daysInRange.forEach(day => {
      const dateKey = day.toISOString().split('T')[0];
      attendanceByDay[dateKey] = [];
    });

    // Group attendance records by date
    attendance.forEach(record => {
      const dateKey = record.date.toISOString().split('T')[0];
      if (!attendanceByDay[dateKey]) {
        attendanceByDay[dateKey] = [];
      }
      attendanceByDay[dateKey].push({
        id: record.id,
        staffId: record.staffRecord.staffId,
        staffName: `${record.staffRecord.firstName} ${record.staffRecord.lastName}`,
        department: record.staffRecord.department,
        position: record.staffRecord.position,
        signInTime: record.signInTime,
        signOutTime: record.signOutTime,
        method: record.method,
        recordedBy: record.recordedById,
      });
    });

    // Calculate daily statistics
    const dailyStats = daysInRange.map(day => {
      const dateKey = day.toISOString().split('T')[0];
      const dayAttendance = attendanceByDay[dateKey] || [];
      const dayName = day.toLocaleDateString('en-US', { weekday: 'long' });
      
      // Count unique staff who attended
      const attendedStaffIds = new Set(dayAttendance.map(a => a.staffId));
      const attendedCount = attendedStaffIds.size;
      const absentCount = Math.max(0, totalStaff - attendedCount);
      const attendancePercentage = totalStaff > 0 ? (attendedCount / totalStaff) * 100 : 0;

      return {
        date: dateKey,
        dayName,
        attended: attendedCount,
        absent: absentCount,
        attendancePercentage: parseFloat(attendancePercentage.toFixed(2)),
        records: dayAttendance.length,
      };
    });

    // Calculate weekly summary
    const totalDays = daysInRange.length;
    const totalBusinessDays = daysInRange.filter(day => {
      const dayOfWeek = day.getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6; // Exclude weekends
    }).length;

    const totalAttended = dailyStats.reduce((sum, day) => sum + day.attended, 0);
    const totalAbsent = dailyStats.reduce((sum, day) => sum + day.absent, 0);
    const totalPossibleAttendance = totalStaff * totalBusinessDays;
    const overallAttendancePercentage = totalPossibleAttendance > 0 
      ? (totalAttended / totalPossibleAttendance) * 100 
      : 0;

    // Calculate staff attendance patterns
    const staffAttendance = await calculateStaffAttendanceStats(
      companyId,
      dateRange.start,
      dateRange.end,
      totalStaff
    );

    const response = NextResponse.json({
      success: true,
      data: {
        period: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
          totalDays,
          businessDays: totalBusinessDays,
          isCustomRange: !!(startDate && endDate),
          weekOffset: startDate && endDate ? null : weekOffset,
        },
        summary: {
          totalStaff,
          totalAttended,
          totalAbsent,
          overallAttendancePercentage: parseFloat(overallAttendancePercentage.toFixed(2)),
          averageDailyAttendance: totalDays > 0 ? parseFloat((totalAttended / totalDays).toFixed(2)) : 0,
          averageDailyAbsence: totalDays > 0 ? parseFloat((totalAbsent / totalDays).toFixed(2)) : 0,
        },
        dailyStats,
        staffAttendance,
        attendanceByDay,
        rawRecords: attendance.map(record => ({
          id: record.id,
          date: record.date,
          signInTime: record.signInTime,
          signOutTime: record.signOutTime,
          method: record.method,
          recordedBy: record.recordedById,
          staff: record.staffRecord,
        })),
      },
    });

    return withCors(response, origin);

  } catch (error: any) {
    console.error("Weekly Attendance Fetch Error:", error);
    const response = NextResponse.json({ 
      success: false, 
      message: "Failed to fetch weekly attendance data",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
    return withCors(response, origin);
  }
}

// Helper function to get all dates in a range
function getDaysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(start);
  const endDate = new Date(end);

  while (current <= endDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

// Helper function to calculate staff attendance statistics
async function calculateStaffAttendanceStats(
  companyId: string,
  startDate: Date,
  endDate: Date,
  totalStaff: number
): Promise<any[]> {
  const { prisma } = await import("@/app/lib/prisma");

  // Get all active staff
  const allStaff = await prisma.staffRecord.findMany({
    where: {
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      staffId: true,
      firstName: true,
      lastName: true,
      department: true,
      position: true,
    },
  });

  // Get attendance for all staff in date range
  const attendance = await prisma.attendance.findMany({
    where: {
      companyId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      staffRecord: {
        isActive: true,
      },
    },
    select: {
      staffId: true,
      date: true,
      signInTime: true,
      signOutTime: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Group attendance by staff
  const attendanceByStaff = new Map<string, any[]>();
  attendance.forEach(record => {
    if (!attendanceByStaff.has(record.staffId)) {
      attendanceByStaff.set(record.staffId, []);
    }
    attendanceByStaff.get(record.staffId)!.push(record);
  });

  // Calculate business days in range
  const businessDays = getBusinessDaysCount(startDate, endDate);

  // Calculate statistics for each staff
  return allStaff.map(staff => {
    const staffAttendance = attendanceByStaff.get(staff.id) || [];
    const attendedDays = new Set(staffAttendance.map(a => a.date.toISOString().split('T')[0])).size;
    const absentDays = Math.max(0, businessDays - attendedDays);
    const attendancePercentage = businessDays > 0 ? (attendedDays / businessDays) * 100 : 0;

    // Calculate average hours (if signInTime and signOutTime are available)
    let totalHours = 0;
    let validRecords = 0;
    
    staffAttendance.forEach(record => {
      if (record.signInTime && record.signOutTime) {
        const signIn = new Date(record.signInTime);
        const signOut = new Date(record.signOutTime);
        const hours = (signOut.getTime() - signIn.getTime()) / (1000 * 60 * 60);
        if (hours > 0 && hours < 24) { // Sanity check
          totalHours += hours;
          validRecords++;
        }
      }
    });

    const averageHours = validRecords > 0 ? totalHours / validRecords : 0;

    return {
      staffId: staff.staffId,
      name: `${staff.firstName} ${staff.lastName}`,
      department: staff.department,
      position: staff.position,
      attendedDays,
      absentDays,
      totalDays: businessDays,
      attendancePercentage: parseFloat(attendancePercentage.toFixed(2)),
      averageHours: parseFloat(averageHours.toFixed(2)),
      totalRecords: staffAttendance.length,
      firstAttendance: staffAttendance.length > 0 
        ? staffAttendance[0].date 
        : null,
      lastAttendance: staffAttendance.length > 0 
        ? staffAttendance[staffAttendance.length - 1].date 
        : null,
    };
  }).sort((a, b) => b.attendancePercentage - a.attendancePercentage); // Sort by attendance percentage
}

// Helper function to count business days (Monday-Friday)
function getBusinessDaysCount(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

async function validateCompanyAccess(user: any, companyId: string): Promise<boolean> {
  const { prisma } = await import("@/app/lib/prisma");

  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  if (user.role === 'HR') {
    return user.companyId === companyId;
  }

  if (user.role === 'ADMIN') {
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId,
        role: { in: ['ADMIN', 'ALL'] }
      }
    });
    return !!userCompany;
  }

  return false;
}