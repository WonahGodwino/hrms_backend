// src/app/api/payslips/duplicates/route.ts
// Detect and delete duplicate payslips: same staff + month/year + SAME payroll
// template, 2 or more payslips. Payslips from different templates in the same
// month are a normal payroll setup and are not duplicates (see
// lib/payroll/payslip-duplicates.ts, which mirrors Payroll Generation's rule).

import { NextRequest } from 'next/server';
import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { staffIdsWithMultiplePayslips } from '@/app/lib/payroll/payslip-duplicate-prefilter';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { groupDuplicatePayslips, payslipDuplicateKey } from '@/app/lib/payroll/payslip-duplicates';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

/**
 * GET /api/payslips/duplicates?companyId=X&month=Y&year=Z
 *
 * Returns groups of duplicate payslips: the same staff member with 2+
 * payslips for the same month/year under the SAME payroll template.
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

    // Only staff with 2+ payslips in this filter can have a duplicate, so load
    // just those instead of every payslip for the company/period.
    const candidateStaffIds = await staffIdsWithMultiplePayslips(where);
    if (candidateStaffIds.length > 0) where.staffRecordId = { in: candidateStaffIds };

    // Fetch payslips with payroll info for those staff. `select`, not
    // `include`, so the stored PDF (fileData) is never loaded.
    const payslips = candidateStaffIds.length === 0 ? [] : await prisma.payslip.findMany({
      where,
      select: {
        id: true,
        payrollId: true,
        staffRecordId: true,
        month: true,
        year: true,
        grossPay: true,
        netPay: true,
        createdAt: true,
        fileName: true,
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

    // Same staff + same period + same template, 2+ payslips.
    const duplicateGroups = groupDuplicatePayslips(payslips)
      .map(([key, slips]) => {
        const staff = slips[0].staffRecord;
        const staffName = [staff.firstName, staff.lastName].filter(Boolean).join(' ') || 'Unknown';

        // Sort by createdAt ascending — no auto-determination of original
        const sorted = [...slips].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        const first = slips[0].payroll;
        const groupTemplateName =
          first?.template?.templateName ||
          (first?.templateType || 'UNKNOWN').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        return {
          groupKey: key,
          templateName: groupTemplateName,
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
 * Always keeps at least one payslip per staff + month/year + template, so this
 * can only ever remove duplicates, never a staff member's only payslip for a
 * template.
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

    // Load the selected payslips, then every payslip in the same staff +
    // period so the safety check sees the whole template group.
    const templateSelect = { payroll: { select: { templateId: true, templateType: true } } } as const;
    const existingPayslips = await prisma.payslip.findMany({
      where: { id: { in: payslipIds } },
      select: { id: true, staffRecordId: true, month: true, year: true, companyId: true, ...templateSelect },
    });

    if (existingPayslips.length === 0) {
      return withCors(ApiResponse.error('No matching payslips found', 404), origin);
    }

    const siblings = await prisma.payslip.findMany({
      where: {
        OR: existingPayslips.map((p) => ({ companyId: p.companyId, staffRecordId: p.staffRecordId, year: p.year })),
      },
      select: { id: true, staffRecordId: true, month: true, year: true, ...templateSelect },
    });

    const toDelete = new Set(payslipIds.map(String));
    const groups = new Map<string, string[]>();
    for (const p of siblings) {
      const key = payslipDuplicateKey(p);
      groups.set(key, [...(groups.get(key) || []), p.id]);
    }

    const safeToDelete: string[] = [];
    const rejected: string[] = [];
    for (const p of existingPayslips) {
      const group = groups.get(payslipDuplicateKey(p)) || [p.id];
      const remaining = group.filter((id) => !toDelete.has(id));
      // Never remove the last payslip of a staff member's template for a period.
      if (remaining.length === 0) rejected.push(p.id);
      else safeToDelete.push(p.id);
    }

    if (safeToDelete.length === 0) {
      return withCors(
        ApiResponse.error(
          "Cannot delete: each selected payslip is the only one of its template for that staff member and period, so it isn't a duplicate",
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
