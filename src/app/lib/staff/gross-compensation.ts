// src/app/lib/staff/gross-compensation.ts
//
// Seeds a new staff member's Compensation profile (StaffPayrollProfile) with
// a Gross figure captured at the point they're created — either through
// single Staff Management registration or onboarding completion. Reuses the
// same GROSS_SYSTEM_FIELD convention as the existing Compensation edit
// drawer (see staff/[id]/compensation/route.ts) so it's usable immediately
// as a PERCENTAGE formula base once payroll is generated.
import { prisma } from '@/app/lib/db';
import { GROSS_SYSTEM_FIELD } from '@/app/lib/payroll/generation/field-resolver';
import { forCompany } from '@/app/lib/data/tenant';

export async function saveInitialGrossCompensation(params: { staffId: string; companyId: string; gross: unknown; updatedBy: string }): Promise<void> {
	const { staffId, companyId, gross, updatedBy } = params;
	const grossNum = Number(gross);
	if (gross === undefined || gross === null || gross === '' || !Number.isFinite(grossNum)) return;

	// A staff's Compensation profile is attached to one of the company's
	// payroll templates (required FK) — without one yet configured, there's
	// nowhere to attach Gross to, so it's silently skipped rather than
	// blocking registration/onboarding.
	const template = await forCompany(companyId).payrollTemplate.findFirst({
		where: { },
		select: { id: true },
	});
	if (!template) return;

	const existing = await prisma.staffPayrollProfile.findUnique({ where: { staffId } });
	const mergedValues = { ...((existing?.values as Record<string, unknown>) || {}), [GROSS_SYSTEM_FIELD]: grossNum };

	await prisma.staffPayrollProfile.upsert({
		where: { staffId },
		create: {
			staffId,
			companyId,
			templateId: template.id,
			values: mergedValues,
			updatedBy,
		},
		update: {
			values: mergedValues,
			updatedBy,
		},
	});
}

/**
 * Bulk form of saveInitialGrossCompensation for uploads: one template lookup, one read of existing profiles and one insert,
 * instead of three or more queries per person. Same rules: rows with no usable Gross are skipped, and without a payroll
 * template nothing is written.
 */
export async function saveInitialGrossCompensationMany(params: {
	companyId: string;
	updatedBy: string;
	rows: { staffId: string; gross: unknown }[];
}): Promise<void> {
	const { companyId, updatedBy } = params;
	const rows = params.rows
		.map((r) => ({ staffId: r.staffId, gross: Number(r.gross), raw: r.gross }))
		.filter((r) => !(r.raw === undefined || r.raw === null || r.raw === '' || !Number.isFinite(r.gross)));
	if (rows.length === 0) return;

	const template = await forCompany(companyId).payrollTemplate.findFirst({ where: { }, select: { id: true } });
	if (!template) return;

	const existing = await prisma.staffPayrollProfile.findMany({
		where: { staffId: { in: rows.map((r) => r.staffId) } },
		select: { staffId: true, values: true },
	});
	const existingById = new Map(existing.map((e) => [e.staffId, e.values as Record<string, unknown> | null]));

	const toCreate = rows.filter((r) => !existingById.has(r.staffId));
	if (toCreate.length) {
		await prisma.staffPayrollProfile.createMany({
			data: toCreate.map((r) => ({
				staffId: r.staffId,
				companyId,
				templateId: template.id,
				values: { [GROSS_SYSTEM_FIELD]: r.gross },
				updatedBy,
			})),
			skipDuplicates: true,
		});
	}
	// A profile that already exists keeps its other values and only gets the Gross merged in.
	for (const r of rows.filter((x) => existingById.has(x.staffId))) {
		 
		await prisma.staffPayrollProfile.update({
			where: { staffId: r.staffId },
			data: { values: { ...(existingById.get(r.staffId) || {}), [GROSS_SYSTEM_FIELD]: r.gross }, updatedBy },
		});
	}
}
