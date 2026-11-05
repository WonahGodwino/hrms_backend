// src/app/api/payroll/generate/[runId]/approve/route.ts
//
// "Approve" step — finalizes a reviewed Payroll Generation run into real
// Payroll/Payslip records via approveGenerationRun(), which duplicates (not
// shares) the equivalent tail of the manual upload path so nothing about
// that proven flow can regress. sendEmails mirrors the toggle already
// offered by the existing upload modal, for UX consistency.
import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import {
    processPayrollApprovalInBackground
} from '@/app/lib/payroll/generation/finalize-generated-payroll';
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest, { params }: { params: { runId: string } }) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}
		const token = authHeader.replace('Bearer ', '');
		const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN']);

		const body = await request.json().catch(() => ({}));
		const sendEmails = body?.sendEmails === true;

		const run = await prisma.payrollGenerationRun.findUnique({ where: { id: params.runId } });
		if (!run) {
			return withCors(ApiResponse.error('Generation run not found', 404), origin);
		}
		if (run.status === 'PROCESSING') {
			return withCors(ApiResponse.error('This payroll is still being processed. Please wait for it to finish.', 409), origin);
		}
		if (run.status === 'APPROVED') {
			return withCors(ApiResponse.error('This run has already been approved', 409), origin);
		}

		const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL';
		const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole);
		if (!hasAccess) {
			return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin);
		}

		await prisma.payrollGenerationRun.update({
			where: { id: params.runId },
			data: { status: 'PROCESSING', approvedBy: user.userId },
		});

		processPayrollApprovalInBackground({ runId: params.runId, approvedBy: user.userId, sendEmails }).catch((error) => {
			console.error('[PAYROLL_GENERATION] Unhandled background approval error:', { runId: params.runId, error });
		});

		return withCors(ApiResponse.success({ runId: params.runId, status: 'PROCESSING' }, 'Payroll approval started'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
