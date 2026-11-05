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

export async function saveInitialGrossCompensation(params: { staffId: string; companyId: string; gross: unknown; updatedBy: string }): Promise<void> {
	const { staffId, companyId, gross, updatedBy } = params;
	const grossNum = Number(gross);
	if (gross === undefined || gross === null || gross === '' || !Number.isFinite(grossNum)) return;

	// A staff's Compensation profile is attached to one of the company's
	// payroll templates (required FK) — without one yet configured, there's
	// nowhere to attach Gross to, so it's silently skipped rather than
	// blocking registration/onboarding.
	const template = await prisma.payrollTemplate.findFirst({
		where: { companyId },
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
