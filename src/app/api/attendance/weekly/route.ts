import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { withCors, handleCorsOptions } from "@/app/lib/cors";

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    // Authorization check
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "Authorization header missing" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const user = requireRole(token, ["HR", "ADMIN", "SUPER_ADMIN"]);

    const { companyId } = req.query;
    if (!companyId) {
      return NextResponse.json({ success: false, message: "Company ID is required" }, { status: 400 });
    }

    // Get the start and end of the week
    const targetDate = new Date();
    const startOfThisWeek = startOfWeek(targetDate);
    const endOfThisWeek = endOfWeek(targetDate);

    // Fetch weekly attendance data
    const attendance = await prisma.attendance.findMany({
      where: {
        companyId,
        date: {
          gte: startOfThisWeek,
          lte: endOfThisWeek,
        },
      },
      include: {
        staffRecord: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        weekStart: startOfThisWeek.toISOString(),
        weekEnd: endOfThisWeek.toISOString(),
        attendance,
      },
    });

  } catch (error) {
    console.error("Weekly Attendance Fetch Error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
