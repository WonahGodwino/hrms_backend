// src/app/services/offboarding.service.ts

import { prisma } from '@/app/lib/db';

// The generated Prisma client in some working copies predates the Offboarding
// model (fixed by `prisma generate` against the current schema). Until then,
// mirror the schema enum locally and access the delegate defensively so this
// module type-checks without requiring a client regeneration.
type OffboardingStatus =
  | 'PENDING_REVIEW'
  | 'HANDOVER_REQUESTED'
  | 'HANDOVER_SUBMITTED'
  | 'COMPLETED'
  | 'REJECTED';

export class OffboardingService {
	// ============================
	// CREATE
	// ============================

	static async createResignation(staffId: string, companyId: string, data: { resignationLetter: string; resignationComment?: string }) {
		// Check if staff already has active offboarding
		const existing = await (prisma as any).offboarding.findFirst({
			where: {
				staffId,
				companyId,
				status: {
					notIn: ['COMPLETED', 'REJECTED'],
				},
			},
		});

		if (existing) {
			throw new Error('You already have an active offboarding process');
		}

		const staff = await prisma.staffRecord.findUnique({
			where: { id: staffId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				department: true,
				departmentId: true,
				position: true,
				staffId: true,
			},
		});

		if (!staff) {
			throw new Error('Staff record not found');
		}

		return (prisma as any).offboarding.create({
			data: {
				companyId,
				staffId,
				departmentId: staff.departmentId || null,
				type: 'RESIGNATION',
				status: 'PENDING_REVIEW',
				initiatedBy: 'STAFF',
				resignationLetter: data.resignationLetter,
				resignationComment: data.resignationComment,
				handoverRequired: true,
				submittedAt: new Date(),
			},
			include: {
				staff: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						staffId: true,
					},
				},
			},
		});
	}

	static async createTermination(hrStaffId: string, companyId: string, data: { staffId: string; handoverRequired: boolean }) {
		// Verify HR/Admin has access to this staff
		const staff = await prisma.staffRecord.findUnique({
			where: { id: data.staffId, companyId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				department: true,
				departmentId: true,
				position: true,
				isActive: true,
				staffId: true,
			},
		});

		if (!staff) {
			throw new Error('Staff not found in your company');
		}

		if (!staff.isActive) {
			throw new Error('Staff is already inactive');
		}

		// Check if staff already has active offboarding
		const existing = await (prisma as any).offboarding.findFirst({
			where: {
				staffId: data.staffId,
				companyId,
				status: {
					notIn: ['COMPLETED'],
				},
			},
		});

		if (existing) {
			throw new Error('Staff already has an active offboarding process');
		}

		// Determine initial status
		const status = data.handoverRequired ? 'HANDOVER_REQUESTED' : 'COMPLETED';
		const completedAt = !data.handoverRequired ? new Date() : null;

		// If handover not required, deactivate staff immediately
		if (!data.handoverRequired) {
			await prisma.staffRecord.update({
				where: { id: data.staffId },
				data: { isActive: false },
			});
		}

		return (prisma as any).offboarding.create({
			data: {
				companyId,
				staffId: data.staffId,
				departmentId: staff.departmentId || null,
				type: 'TERMINATION',
				status,
				initiatedBy: 'HR',
				handoverRequired: data.handoverRequired,
				completedAt,
			},
			include: {
				staff: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						staffId: true,
					},
				},
			},
		});
	}

	// ============================
	// READ
	// ============================

	static async getOffboardings(
		companyId: string,
		filters: {
			status?: OffboardingStatus[];
			type?: 'RESIGNATION' | 'TERMINATION';
			search?: string;
			page?: number;
			limit?: number;
		}
	) {
		const { status, type, search, page = 1, limit = 20 } = filters;
		const skip = (page - 1) * limit;

		const where: any = { companyId };

		if (status && status.length > 0) {
			where.status = { in: status };
		}

		if (type) {
			where.type = type;
		}

		if (search) {
			where.OR = [
				{ staffId: { contains: search, mode: 'insensitive' } },
				{ staff: { firstName: { contains: search, mode: 'insensitive' } } },
				{ staff: { lastName: { contains: search, mode: 'insensitive' } } },
				{ staff: { email: { contains: search, mode: 'insensitive' } } },
				{ staff: { staffId: { contains: search, mode: 'insensitive' } } },
			];
		}

		const [offboardings, total] = await Promise.all([
			(prisma as any).offboarding.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit,
				include: {
					staff: {
						// ← Now this works because the relation is uncommented
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
							staffId: true,
							department: true,
							position: true,
						},
					},
					reviewer: {
						// ← Now this works because the relation is uncommented
						select: {
							id: true,
							firstName: true,
							lastName: true,
						},
					},
				},
			}),
			(prisma as any).offboarding.count({ where }),
		]);

		return {
			offboardings,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	static async getStaffOffboardings(staffId: string, companyId: string) {
		return (prisma as any).offboarding.findMany({
			where: {
				staffId,
				companyId,
			},
			orderBy: { createdAt: 'desc' },
		});
	}

	static async getOffboardingById(id: string, companyId: string) {
		const offboarding = await (prisma as any).offboarding.findFirst({
			where: { id, companyId },
			include: {
				staff: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						staffId: true,
						department: true,
						position: true,
						isActive: true,
					},
				},
				reviewer: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
					},
				},
			},
		});

		if (!offboarding) {
			throw new Error('Offboarding record not found');
		}

		return offboarding;
	}

	// ============================
	// UPDATE
	// ============================

	static async reviewResignation(offboardingId: string, companyId: string, reviewerId: string, action: 'APPROVE' | 'REQUEST_HANDOVER' | 'REJECT', comment?: string) {
		const offboarding = await (prisma as any).offboarding.findFirst({
			where: { id: offboardingId, companyId },
			select: {
				status: true,
				handoverRequired: true,
				staffId: true,
				type: true,
			},
		});

		if (!offboarding) {
			throw new Error('Offboarding record not found');
		}

		if (offboarding.type !== 'RESIGNATION') {
			throw new Error('Only resignations can be reviewed');
		}

		if (offboarding.status !== 'PENDING_REVIEW') {
			throw new Error(`Cannot review offboarding in ${offboarding.status} status`);
		}

		let newStatus: OffboardingStatus;
		const updates: any = {
			reviewedBy: reviewerId,
			reviewedAt: new Date(),
			reviewComment: comment,
		};

		switch (action) {
			case 'APPROVE':
				if (offboarding.handoverRequired) {
					newStatus = 'HANDOVER_REQUESTED';
				} else {
					newStatus = 'COMPLETED';
					updates.completedAt = new Date();
					// Deactivate staff
					await prisma.staffRecord.update({
						where: { id: offboarding.staffId },
						data: { isActive: false },
					});
				}
				break;

			case 'REQUEST_HANDOVER':
				newStatus = 'HANDOVER_REQUESTED';
				break;

			case 'REJECT':
				newStatus = 'REJECTED';
				break;

			default:
				throw new Error('Invalid action');
		}

		return (prisma as any).offboarding.update({
			where: { id: offboardingId },
			data: {
				...updates,
				status: newStatus,
			},
			include: {
				staff: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
					},
				},
			},
		});
	}

	static async uploadHandover(offboardingId: string, companyId: string, staffId: string, handoverDocument: string) {
		const offboarding = await (prisma as any).offboarding.findFirst({
			where: { id: offboardingId, companyId, staffId },
			select: { status: true },
		});

		if (!offboarding) {
			throw new Error('Offboarding record not found or you do not have access');
		}

		if (offboarding.status !== 'HANDOVER_REQUESTED') {
			throw new Error(`Cannot upload handover in ${offboarding.status} status`);
		}

		return (prisma as any).offboarding.update({
			where: { id: offboardingId },
			data: {
				handoverDocument,
				handoverSubmittedAt: new Date(),
				status: 'HANDOVER_SUBMITTED',
			},
		});
	}

	static async approveOffboarding(offboardingId: string, companyId: string, reviewerId: string, comment?: string) {
		const offboarding = await (prisma as any).offboarding.findFirst({
			where: { id: offboardingId, companyId },
			select: { status: true, staffId: true },
		});

		if (!offboarding) {
			throw new Error('Offboarding record not found');
		}

		if (offboarding.status !== 'HANDOVER_SUBMITTED') {
			throw new Error(`Cannot approve offboarding in ${offboarding.status} status`);
		}

		// Deactivate staff
		await prisma.staffRecord.update({
			where: { id: offboarding.staffId },
			data: { isActive: false },
		});

		return (prisma as any).offboarding.update({
			where: { id: offboardingId },
			data: {
				status: 'COMPLETED',
				completedAt: new Date(),
				reviewedBy: reviewerId,
				reviewedAt: new Date(),
				reviewComment: comment,
			},
		});
	}

	// ============================
	// HELPERS
	// ============================

	static async canAccessOffboarding(offboardingId: string, userId: string, userRole: string, companyId: string): Promise<boolean> {
		if (userRole === 'SUPER_ADMIN') return true;

		const offboarding = await (prisma as any).offboarding.findFirst({
			where: {
				id: offboardingId,
				companyId,
				OR: [
					// Staff can access their own
					{ staffId: userId },
					// HR/Admin can access any
					...(['ADMIN', 'HR'].includes(userRole) ? [{}] : []),
				],
			},
		});

		return !!offboarding;
	}

	// Check if staff has active offboarding
	static async hasActiveOffboarding(staffId: string, companyId: string): Promise<boolean> {
		const count = await (prisma as any).offboarding.count({
			where: {
				staffId,
				companyId,
				status: {
					notIn: ['COMPLETED', 'REJECTED'],
				},
			},
		});
		return count > 0;
	}
}
