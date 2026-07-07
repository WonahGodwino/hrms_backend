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
});

// Approve Offboarding Schema
export const ApproveOffboardingSchema = z.object({
	comment: z.string().optional(),
});

// Query Filters Schema
// Update the schema to handle single status values properly
export const OffboardingFiltersSchema = z.object({
	status: z
		.union([z.array(OffboardingStatusEnum), OffboardingStatusEnum])
		.optional()
		.transform((val) => {
			// If it's a single value, convert to array
			if (val && !Array.isArray(val)) {
				return [val];
			}
			return val;
		}),
	type: OffboardingTypeEnum.optional(),
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
