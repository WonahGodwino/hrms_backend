import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; // Prisma client
import { requireAuth } from "@/app/lib/auth"; // Authentication middleware
import { withCors } from "@/app/lib/cors";

// Utility function to get the start of the day
function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0); // Normalize to start of the day in UTC
  return d;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const user = await requireAuth(req); // Returns user info after verifying auth
    const body = await req.json();
    const { companyId, identifier, method } = body as {
      companyId: string;
      identifier: string;
      method: "staff_id" | "email" | "barcode";
    };

    // Check if user has permission (HR/Admin/SuperAdmin)
    const allowed = user.role === "SUPER_ADMIN" || 
                    (user.role === "HR" && user.companyId === companyId) ||
                    (user.role === "ADMIN" && user.assignedCompanyIds?.includes(companyId));
    
    if (!allowed) {
      const res = NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      return withCors(res, origin);
    }

    // Find the staff using the identifier (staff_id, email, barcode)
    const staff = await prisma.staffRecord.findFirst({
      where: {
        companyId,
        OR: [
          { staffId: identifier },
          { email: identifier },
          { encodedId: identifier }, // for barcode
        ],
      },
      select: { id: true, staffId: true, email: true, fullName: true },
    });

    if (!staff) {
      const res = NextResponse.json({ success: false, message: "Staff not found" }, { status: 404 });
      return withCors(res, origin);
    }

    // Check if the staff already signed in today
    const today = startOfDay(new Date()); // Normalized to UTC start-of-day
    const attendance = await prisma.Attendance .findUnique({
      where: {
        companyId_staffId_date: {
          companyId,
          staffId: staff.id,
          date: today,
        },
      },
    });

    if (attendance && attendance.signInAt && !attendance.signOutAt) {
      // Sign out staff if already signed in
      const updatedAttendance = await prisma.Attendance.update({
        where: { id: attendance.id },
        data: {
          signOutAt: new Date(),
          recordedById: user.id,
          recordedByRole: user.role,
        },
      });
      const res = NextResponse.json({
        success: true,
        message: "Staff signed out",
        attendance: updatedAttendance,
      });
      return withCors(res, origin);
    }

    // Create attendance record for sign-in
    if (!attendance) {
      const signInRecord = await prisma.Attendance.create({
        data: {
          companyId,
          staffId: staff.id,
          date: today,
          signInAt: new Date(),
          recordedById: user.id,
          recordedByRole: user.role,
          method,
        },
      });
      const res = NextResponse.json({
        success: true,
        message: "Staff signed in",
        attendance: signInRecord,
      });
      return withCors(res, origin);
    }

    return NextResponse.json({ success: false, message: "Unexpected error" }, { status: 400 });
  } catch (e: any) {
    const res = NextResponse.json({ success: false, message: "Internal error", error: e?.message || "Unknown" }, { status: 500 });
    return withCors(res, origin);
  }
}
