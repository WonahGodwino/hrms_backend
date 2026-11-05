// src/app/lib/payroll/reports/source-scope.ts
//
// Which Payroll rows belong to one payroll "source" (a completed upload or an
// approved generation run). Shared by the per-run reports (Pension Schedule,
// Statutory Schedule) so they always agree on the rows for a run.
//  - Upload: rows linked by payrollUploadId; legacy uploads that predate the
//    link fall back to the company's rows created during the upload window.
//  - Generated: PayrollData rows for the run's company/template/period point
//    at the Payroll rows the run produced.
import { prisma } from '@/app/lib/db';
import type { BankScheduleSourceType } from '@/app/lib/payroll/reports/bank-schedule';

export type PayrollSourceScope = {
	sourceType: BankScheduleSourceType;
	sourceId: string;
	companyId: string;
	companyName: string;
	companyPensionEmployerCode: string;
	templateId: string | null;
	status: string;
	createdAt: Date;
	// Upload file name, or null for a generation run.
	fileName: string | null;
	// The run's pay period ("October 2026"); null for uploads (read it from the rows).
	payPeriod: string | null;
	payrollWhere: Record<string, unknown>;
};

export async function resolvePayrollSource(sourceType: BankScheduleSourceType, sourceId: string, companyIds: string[]): Promise<PayrollSourceScope | null> {
	if (sourceType === 'upload') {
		const upload = await prisma.payrollUpload.findUnique({
			where: { id: sourceId },
			include: { company: { select: { companyName: true, pensionEmployerCode: true } } },
		});
		if (!upload || !companyIds.includes(upload.companyId)) return null;

		const linkedCount = await prisma.payroll.count({ where: { payrollUploadId: upload.id } });
		const payrollWhere =
			linkedCount > 0
				? { payrollUploadId: upload.id }
				: {
						companyId: upload.companyId,
						createdAt: {
							gte: upload.startedAt || upload.createdAt,
							lte: upload.completedAt || undefined,
						},
					};
		return {
			sourceType,
			sourceId,
			companyId: upload.companyId,
			companyName: upload.company?.companyName || '',
			companyPensionEmployerCode: upload.company?.pensionEmployerCode || '',
			templateId: upload.templateId || null,
			status: upload.status,
			createdAt: upload.createdAt,
			fileName: upload.fileName,
			payPeriod: null,
			payrollWhere,
		};
	}

	const run = await prisma.payrollGenerationRun.findUnique({
		where: { id: sourceId },
		include: { company: { select: { companyName: true, pensionEmployerCode: true } } },
	});
	if (!run || !companyIds.includes(run.companyId)) return null;

	const payrollDataRows = await prisma.payrollData.findMany({
		where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod, payrollId: { not: null } },
		select: { payrollId: true },
		distinct: ['payrollId'],
	});
	const payrollIds = payrollDataRows.map((row) => row.payrollId).filter((id): id is string => !!id);

	return {
		sourceType,
		sourceId,
		companyId: run.companyId,
		companyName: run.company?.companyName || '',
		companyPensionEmployerCode: run.company?.pensionEmployerCode || '',
		templateId: run.templateId,
		status: run.status,
		createdAt: run.createdAt,
		fileName: null,
		payPeriod: run.payPeriod,
		// An empty `in` list matches nothing, which is right for a run with no rows.
		payrollWhere: { id: { in: payrollIds } },
	};
}
