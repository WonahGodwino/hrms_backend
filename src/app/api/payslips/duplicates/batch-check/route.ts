// src/app/api/payslips/duplicates/batch-check/route.ts
// Batch check: find all staff in a company who have duplicate payslips
// Used by Staff Management to show duplicate indicators on staff cards

import { NextRequest } from 'next/server';
import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

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

    const payslips = await prisma.payslip.findMany({
      where,
      select: {
        staffRecordId: true,
        payrollId: true,
        month: true,
        year: true,
      },
    });

    // Group by staffRecordId + month + year
    const groups: Record<string, Set<string>> = {};
    for (const p of payslips) {
      const key = `${p.staffRecordId}-${p.month}-${p.year}`;
      if (!groups[key]) groups[key] = new Set();
      groups[key].add(p.payrollId);
    }

    // Find staff with at least one duplicate group
    const staffWithDuplicates: Record<string, { hasDuplicates: boolean; duplicateCount: number; totalExcessPayslips: number }> = {};

    for (const [key, payrollIds] of Object.entries(groups)) {
      if (payrollIds.size > 1) {
        const staffRecordId = key.split('-')[0]; // first part is staffRecordId
        // Parse the key more carefully (staffRecordId could contain dashes)
        const dashIndex = key.indexOf('-');
        const actualStaffId = key.substring(0, dashIndex);

        if (!staffWithDuplicates[actualStaffId]) {
          staffWithDuplicates[actualStaffId] = {
            hasDuplicates: true,
            duplicateCount: 0,
            totalExcessPayslips: 0,
          };
        }
        staffWithDuplicates[actualStaffId].duplicateCount++;
        staffWithDuplicates[actualStaffId].totalExcessPayslips += payrollIds.size - 1;
      }
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
