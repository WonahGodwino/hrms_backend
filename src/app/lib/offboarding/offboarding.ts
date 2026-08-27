import { z } from 'zod';

// Enums as const for validation
export const OffboardingTypeEnum = z.enum(['RESIGNATION', 'TERMINATION']);
export const OffboardingStatusEnum = z.enum(['PENDING_REVIEW', 'HANDOVER_REQUESTED', 'HANDOVER_SUBMITTED', 'COMPLETED', 'REJECTED']);
export const InitiatedByEnum = z.enum(['STAFF', 'HR']);

// Submit Resignation Schema
export const SubmitResignationSchema = z.object({
	resignationLetter: z.string().min(1, 'Resignation letter is required'),
	resignationComment: z.string().optional(),
});

// Initiate Termination Schema
export const InitiateTerminationSchema = z.object({
	staffId: z.string().min(1, 'Staff ID is required'),
	handoverRequired: z.boolean().default(true),
});

// Review Resignation Schema
export const ReviewResignationSchema = z.object({
	action: z.enum(['APPROVE', 'REQUEST_HANDOVER', 'REJECT']),
	comment: z.string().optional(),
});

// Upload Handover Schema
export const UploadHandoverSchema = z.object({
	handoverDocument: z.string().min(1, 'Handover document is required'),
	companyId: z.string().optional(),
});

// Approve Offboarding Schema
export const ApproveOffboardingSchema = z.object({
	comment: z.string().optional(),
	companyId: z.string().optional(),
});

// Query Filters Schema
// `status` may arrive as: undefined/null (not filtering), a single enum string,
// a comma-separated string (the frontend joins multi-select filters with ','),
// or an array of the above — normalize all of these to a string[] before
// validating each entry against the enum. `type`/`status` may also arrive as
// `null` (searchParams.get() returns null, not undefined, when a param is
// absent), so both are coerced to undefined first.
export const OffboardingFiltersSchema = z.object({
	status: z
		.preprocess((val) => {
			if (val === null || val === undefined || val === '') return undefined;
			const parts = Array.isArray(val) ? val : [val];
			const split = parts.flatMap((v) => (typeof v === 'string' ? v.split(',') : v)).map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean);
			return split.length ? split : undefined;
		}, z.array(OffboardingStatusEnum))
		.optional(),
	type: z.preprocess((val) => (val === null || val === '' ? undefined : val), OffboardingTypeEnum).optional(),
	search: z.string().optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(20),
});
// Types
export type SubmitResignationInput = z.infer<typeof SubmitResignationSchema>;
export type InitiateTerminationInput = z.infer<typeof InitiateTerminationSchema>;
export type ReviewResignationInput = z.infer<typeof ReviewResignationSchema>;
export type UploadHandoverInput = z.infer<typeof UploadHandoverSchema>;
export type ApproveOffboardingInput = z.infer<typeof ApproveOffboardingSchema>;
export type OffboardingFilters = z.infer<typeof OffboardingFiltersSchema>;
