// src/app/api/payslips/duplicates/route.ts
// Detect and delete duplicate payslips:
// Same staffRecordId + month + year + companyId but different payrollId

import { NextRequest } from 'next/server';
import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * GET /api/payslips/duplicates?companyId=X&month=Y&year=Z
 *
 * Returns groups of duplicate payslips. A "duplicate" is when the same
 * staff member has 2+ payslips generated from different payroll cycles
 * (different payrollId) for the same month/year/company.
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

    // Build the where clause
    const where: any = { companyId };
    if (month) where.month = month;
    if (year) where.year = parseInt(year);

    // Fetch all payslips with payroll info for this company/period
    const payslips = await prisma.payslip.findMany({
      where,
      include: {
        payroll: {
          select: {
            id: true,
            templateType: true,
            templateId: true,
            createdAt: true,
            source: true,
            template: {
              select: {
                templateName: true,
              },
            },
          },
        },
        staffRecord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffId: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by staffRecordId + month + year to find duplicates
    const groups: Record<string, typeof payslips> = {};
    for (const payslip of payslips) {
      const key = `${payslip.staffRecordId}-${payslip.month}-${payslip.year}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(payslip);
    }

    // Filter to only groups with 2+ unique payrollIds (true duplicates)
    const duplicateGroups = Object.entries(groups)
      .filter(([, slips]) => {
        const uniquePayrollIds = new Set(slips.map((s) => s.payrollId));
        return uniquePayrollIds.size > 1;
      })
      .map(([key, slips]) => {
        const staff = slips[0].staffRecord;
        const staffName = [staff.firstName, staff.lastName].filter(Boolean).join(' ') || 'Unknown';

        // Sort by createdAt ascending — no auto-determination of original
        const sorted = [...slips].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return {
          groupKey: key,
          staffName,
          staffId: staff.staffId,
          staffEmail: staff.email,
          month: slips[0].month,
          year: slips[0].year,
          totalCount: slips.length,
          payslips: sorted.map((s) => {
            // Resolve template display name: prefer the actual template name,
            // fall back to a sentence-cased version of the templateType enum.
            const rawType = s.payroll?.templateType || 'UNKNOWN';
            const templateName = s.payroll?.template?.templateName;
            const displayTemplate =
              templateName ||
              rawType
                .toLowerCase()
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());

            return {
              id: s.id,
              payrollId: s.payrollId,
              templateType: rawType,
              templateName: displayTemplate,
              grossPay: s.grossPay?.toString() || '0',
              netPay: s.netPay?.toString() || '0',
              createdAt: s.createdAt,
              fileName: s.fileName,
              // 'UPLOAD' vs 'GENERATED' — see PATCH /api/payslips/[id].
              source: s.payroll?.source || 'UPLOAD',
            };
          }),
        };
      });

    const totalDuplicateGroups = duplicateGroups.length;
    const totalDuplicatePayslips = duplicateGroups.reduce(
      (sum, g) => sum + g.totalCount - 1, // all but one per group are deletable
      0
    );

    return withCors(
      ApiResponse.success(
        {
          duplicateGroups,
          summary: {
            totalDuplicateGroups,
            totalDuplicatePayslips,
          },
        },
        `Found ${totalDuplicateGroups} duplicate group(s) with ${totalDuplicatePayslips} excess payslip(s)`
      ),
      origin
    );
  } catch (error) {
    console.error('[PAYSLIP_DUPLICATES] Error:', error);
    return withCors(handleApiError(error), origin);
  }
}

/**
 * DELETE /api/payslips/duplicates
 *
 * Delete selected duplicate payslips. Body: { payslipIds: string[] }
 * Always preserves at least one payslip per staff+month+year group.
 */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin');

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin);
    }

    const token = authHeader.replace('Bearer ', '');
    const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

    const body = await request.json();
    const { payslipIds } = body;

    if (!payslipIds || !Array.isArray(payslipIds) || payslipIds.length === 0) {
      return withCors(
        ApiResponse.error('Please provide an array of payslip IDs to delete', 400),
        origin
      );
    }

    // Verify all payslips exist
    const existingPayslips = await prisma.payslip.findMany({
      where: { id: { in: payslipIds } },
      select: {
        id: true,
        staffRecordId: true,
        month: true,
        year: true,
        companyId: true,
      },
    });

    if (existingPayslips.length === 0) {
      return withCors(ApiResponse.error('No matching payslips found', 404), origin);
    }

    // Check if all payslips to be deleted belong to the same pay-period (month/year).
    // If yes, they are all duplicates from the same period — safe to delete all.
    // If not, apply the safety check to preserve at least one per staff+period.
    const toDelete = new Set(payslipIds);

    const allSamePeriod = existingPayslips.every(
      (p) => p.month === existingPayslips[0].month && p.year === existingPayslips[0].year
    );

    let safeToDelete: string[] = [];
    let rejected: string[] = [];

    if (allSamePeriod) {
      // All payslips are from the same pay-period — delete them all
      safeToDelete = existingPayslips.map((p) => p.id).filter((id) => toDelete.has(id));
    } else {
      // Different periods — group by staff+month+year and ensure at least one remains per group
      const groups: Record<string, string[]> = {};
      for (const p of existingPayslips) {
        const key = `${p.staffRecordId}-${p.month}-${p.year}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p.id);
      }

      for (const [, groupIds] of Object.entries(groups)) {
        const remainingAfterDelete = groupIds.filter((id) => !toDelete.has(id));
        if (remainingAfterDelete.length === 0) {
          rejected.push(...groupIds.filter((id) => toDelete.has(id)));
        } else {
          safeToDelete.push(...groupIds.filter((id) => toDelete.has(id)));
        }
      }
    }

    if (safeToDelete.length === 0) {
      return withCors(
        ApiResponse.error(
          'Cannot delete: this would remove all payslips for one or more staff members in the selected period',
          400
        ),
        origin
      );
    }

    // Perform the deletion
    const result = await prisma.payslip.deleteMany({
      where: { id: { in: safeToDelete } },
    });

    return withCors(
      ApiResponse.success(
        {
          deletedCount: result.count,
          deletedIds: safeToDelete,
          rejectedIds: rejected,
          deletedBy: user.userId,
        },
        `${result.count} duplicate payslip(s) deleted successfully`
      ),
      origin
    );
  } catch (error) {
    console.error('[PAYSLIP_DUPLICATES_DELETE] Error:', error);
    return withCors(handleApiError(error), origin);
  }
}
