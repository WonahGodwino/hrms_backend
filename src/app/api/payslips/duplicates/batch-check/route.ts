// src/app/api/payslips/duplicates/batch-check/route.ts
// Batch check: find all staff in a company who have duplicate payslips
// Used by Staff Management to show duplicate indicators on staff cards

import { NextRequest } from 'next/server';
import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { staffIdsWithMultiplePayslips } from '@/app/lib/payroll/payslip-duplicate-prefilter';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { groupDuplicatePayslips } from '@/app/lib/payroll/payslip-duplicates';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * GET /api/payslips/duplicates/batch-check?companyId=X&month=Y&year=Z
 *
 * Returns a map of staffRecordId → { hasDuplicates, duplicateCount }
 * so the Staff Management table can show badges/indicators.
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
    const companyId = searchParams.get('companyId');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!companyId) {
      return withCors(ApiResponse.error('companyId is required', 400), origin);
    }

    // Fetch all payslips for this company (optionally filtered by period)
    const where: any = { companyId };
    if (month) where.month = month;
    if (year) where.year = parseInt(year);

    // Only staff with 2+ payslips in the filter can have duplicates.
    const candidateStaffIds = await staffIdsWithMultiplePayslips(where);
    if (candidateStaffIds.length > 0) where.staffRecordId = { in: candidateStaffIds };

    const payslips = candidateStaffIds.length === 0 ? [] : await prisma.payslip.findMany({
      where,
      select: {
        staffRecordId: true,
        payrollId: true,
        month: true,
        year: true,
        payroll: { select: { templateId: true, templateType: true } },
      },
    });

    // Duplicates = same staff + period + SAME template (2+ payslips).
    const staffWithDuplicates: Record<string, { hasDuplicates: boolean; duplicateCount: number; totalExcessPayslips: number }> = {};

    for (const [, slips] of groupDuplicatePayslips(payslips)) {
      const staffRecordId = slips[0].staffRecordId;
      const entry = (staffWithDuplicates[staffRecordId] ||= { hasDuplicates: true, duplicateCount: 0, totalExcessPayslips: 0 });
      entry.duplicateCount++;
      entry.totalExcessPayslips += slips.length - 1;
    }

    const affectedStaffCount = Object.keys(staffWithDuplicates).length;

    return withCors(
      ApiResponse.success(
        {
          staffWithDuplicates,
          summary: {
            affectedStaffCount,
            totalDuplicateGroups: Object.values(staffWithDuplicates).reduce(
              (sum, s) => sum + s.duplicateCount,
              0
            ),
          },
        },
        affectedStaffCount > 0
          ? `Found ${affectedStaffCount} staff member(s) with duplicate payslips`
          : 'No duplicate payslips found'
      ),
      origin
    );
  } catch (error) {
    console.error('[PAYSLIP_DUPLICATE_BATCH_CHECK] Error:', error);
    return withCors(handleApiError(error), origin);
  }
}
