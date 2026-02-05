// src/app/api/attendance/daily/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { withCors, handleCorsOptions, getCorsHeaders } from "@/app/lib/cors";

// Utility function to get the start of the day
function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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
    const adminUser = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);
    
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

    let attendanceRecord;
    let action: 'SIGN_IN' | 'SIGN_OUT';
    let message: string;

    if (existingAttendance && existingAttendance.signInTime && !existingAttendance.signOutTime) {
      // 8. Staff is signing OUT (already signed in today)
      attendanceRecord = await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          signOutTime: now,
          recordedById: adminUser.userId,
          recordedByRole: adminUser.role,
          method,
          updatedAt: now,
        },
      });
      action = 'SIGN_OUT';
      message = `${staff.firstName} ${staff.lastName} signed out successfully`;
      
    } else {
      // 9. Staff is signing IN (no sign-in today or already signed out)
      
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
        },
      });
      action = 'SIGN_IN';
      message = `${staff.firstName} ${staff.lastName} signed in successfully`;
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
          date: attendanceRecord.date,
          signInAt: attendanceRecord.signInTime,
          signOutAt: attendanceRecord.signOutTime,
          method: attendanceRecord.method,
        },
        staff: {
          id: staff.id,
          staffId: staff.staffId,
          name: `${staff.firstName} ${staff.lastName}`,
          email: staff.email,
          position: staff.position,
          department: staff.department,
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
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);
    
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
  const { prisma } = await import("@/app/lib/prisma");
  
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }
  
  if (user.role === 'HR') {
    return user.companyId === companyId;
  }
  
  if (user.role === 'ADMIN') {
    // Check if admin has access to this company
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