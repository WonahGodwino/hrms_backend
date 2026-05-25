import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { requireModuleAccess } from "@/app/lib/module-access";
import { withCors, handleCorsOptions } from "@/app/lib/cors";

// Helper functions to get start and end of month
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
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
    const user = await requireModuleAccess(token, 'ATTENDANCE', ["HR", "ADMIN", "SUPER_ADMIN"]);

    // Get query parameters from URL
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    const month = url.searchParams.get("month");
    const year = url.searchParams.get("year");

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

    // Determine target month and year
    let targetDate = new Date();
    if (year && month) {
      const yearNum = parseInt(year);
      const monthNum = parseInt(month) - 1; // JavaScript months are 0-indexed
      if (!isNaN(yearNum) && !isNaN(monthNum) && monthNum >= 0 && monthNum <= 11) {
        targetDate = new Date(yearNum, monthNum, 1);
      }
    }

    // Get the start and end of the month
    const startOfMonthDate = startOfMonth(targetDate);
    const endOfMonthDate = endOfMonth(targetDate);

    // Fetch all staff for the company to calculate stats
    const totalStaff = await prisma.staffRecord.count({
      where: {
        companyId,
        isActive: true,
      },
    });

    // Fetch monthly attendance data
    const attendance = await prisma.attendance.findMany({
      where: {
        companyId,
        date: {
          gte: startOfMonthDate,
          lte: endOfMonthDate,
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
      orderBy: {
        date: 'desc',
      },
    });

    // Calculate statistics
    const staffAttendanceMap = new Map<string, {
      staffId: string;
      name: string;
      daysPresent: number;
      daysAbsent: number;
      totalDaysInMonth: number;
      attendancePercentage: number;
      firstRecord: Date | null;
      lastRecord: Date | null;
    }>();

    // Initialize map for all staff
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
      },
    });

    allStaff.forEach(staff => {
      staffAttendanceMap.set(staff.id, {
        staffId: staff.staffId,
        name: `${staff.firstName} ${staff.lastName}`,
        daysPresent: 0,
        daysAbsent: 0,
        totalDaysInMonth: getBusinessDaysCount(startOfMonthDate, endOfMonthDate),
        attendancePercentage: 0,
        firstRecord: null,
        lastRecord: null,
      });
    });

    // Process attendance records
    attendance.forEach(record => {
      const staffData = staffAttendanceMap.get(record.staffId);
      if (staffData) {
        staffData.daysPresent++;
        
        // Track first and last record dates
        const recordDate = new Date(record.signInTime || record.date);
        if (!staffData.firstRecord || recordDate < staffData.firstRecord) {
          staffData.firstRecord = recordDate;
        }
        if (!staffData.lastRecord || recordDate > staffData.lastRecord) {
          staffData.lastRecord = recordDate;
        }
      }
    });

    // Calculate percentages and absent days
    const staffAttendance = Array.from(staffAttendanceMap.values()).map(staff => {
      staff.daysAbsent = staff.totalDaysInMonth - staff.daysPresent;
      staff.attendancePercentage = staff.totalDaysInMonth > 0 
        ? (staff.daysPresent / staff.totalDaysInMonth) * 100 
        : 0;
      return staff;
    });

    // Sort by attendance percentage (descending)
    staffAttendance.sort((a, b) => b.attendancePercentage - a.attendancePercentage);

    // Overall statistics
    const totalDaysInMonth = getBusinessDaysCount(startOfMonthDate, endOfMonthDate);
    const totalPossibleAttendanceDays = totalStaff * totalDaysInMonth;
    const totalPresentDays = staffAttendance.reduce((sum, staff) => sum + staff.daysPresent, 0);
    const totalAbsentDays = staffAttendance.reduce((sum, staff) => sum + staff.daysAbsent, 0);
    const overallAttendancePercentage = totalPossibleAttendanceDays > 0 
      ? (totalPresentDays / totalPossibleAttendanceDays) * 100 
      : 0;

    const response = NextResponse.json({
      success: true,
      data: {
        month: targetDate.getMonth() + 1,
        year: targetDate.getFullYear(),
        monthStart: startOfMonthDate.toISOString(),
        monthEnd: endOfMonthDate.toISOString(),
        statistics: {
          totalStaff,
          totalDaysInMonth,
          totalPresentDays,
          totalAbsentDays,
          overallAttendancePercentage: parseFloat(overallAttendancePercentage.toFixed(2)),
          averageAttendancePerStaff: totalStaff > 0 ? parseFloat((totalPresentDays / totalStaff).toFixed(2)) : 0,
        },
        staffAttendance,
        attendanceRecords: attendance.map(record => ({
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
    console.error("Monthly Attendance Fetch Error:", error);
    const response = NextResponse.json({ 
      success: false, 
      message: "Failed to fetch monthly attendance data",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
    return withCors(response, origin);
  }
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