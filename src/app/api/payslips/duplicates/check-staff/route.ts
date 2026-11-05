// src/app/api/payslips/duplicates/check-staff/route.ts
// Check duplicate payslips for a specific staff member
// Used by Staff Management to show duplicate indicators

import { NextRequest } from 'next/server';
import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * GET /api/payslips/duplicates/check-staff?staffRecordId=X&companyId=Y
 *
 * Returns duplicate info for a specific staff member across all periods,
 * or for a specific period if month/year are provided.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin);
    }

    const token = authHeader.replace('Bearer ', '');
    requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

    const { searchParams } = new URL(request.url);
    const staffRecordId = searchParams.get('staffRecordId');
    const companyId = searchParams.get('companyId');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!staffRecordId || !companyId) {
      return withCors(ApiResponse.error('staffRecordId and companyId are required', 400), origin);
    }

    const where: any = { staffRecordId, companyId };
    if (month) where.month = month;
    if (year) where.year = parseInt(year);

    const payslips = await prisma.payslip.findMany({
      where,
      include: {
        payroll: {
          select: { id: true, templateType: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month+year
    const groups: Record<string, typeof payslips> = {};
    for (const p of payslips) {
      const key = `${p.month}-${p.year}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }

    const duplicates: Array<{
      month: string;
      year: number;
      totalCount: number;
      excessCount: number;
      payslips: Array<{
        id: string;
        payrollId: string;
        templateType: string;
        grossPay: string;
        netPay: string;
        createdAt: Date;
        isOriginal: boolean;
      }>;
    }> = [];

    for (const [, slips] of Object.entries(groups)) {
      const uniquePayrollIds = new Set(slips.map((s) => s.payrollId));
      if (uniquePayrollIds.size > 1) {
        const sorted = [...slips].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        duplicates.push({
          month: slips[0].month,
          year: slips[0].year,
          totalCount: slips.length,
          excessCount: slips.length - 1,
          payslips: sorted.map((s, idx) => ({
            id: s.id,
            payrollId: s.payrollId,
            templateType: s.payroll?.templateType || 'UNKNOWN',
            grossPay: s.grossPay?.toString() || '0',
            netPay: s.netPay?.toString() || '0',
            createdAt: s.createdAt,
            isOriginal: idx === 0,
          })),
        });
      }
    }

    return withCors(
      ApiResponse.success(
        {
          staffRecordId,
          hasDuplicates: duplicates.length > 0,
          totalDuplicatePeriods: duplicates.length,
          totalExcessPayslips: duplicates.reduce((sum, d) => sum + d.excessCount, 0),
          duplicates,
        },
        duplicates.length > 0
          ? `Found ${duplicates.length} period(s) with duplicate payslips`
          : 'No duplicate payslips found'
      ),
      origin
    );
  } catch (error) {
    console.error('[PAYSLIP_DUPLICATE_CHECK_STAFF] Error:', error);
    return withCors(handleApiError(error), origin);
  }
}
