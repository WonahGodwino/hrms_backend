import { prisma } from '@/app/lib/db';

export function normalizeDesignationTitle(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const normalized = raw.replace(/\s+/g, ' ').trim();
	return normalized || null;
}

async function generateDesignationCode(companyId: string, title: string): Promise<string> {
	const words = title.split(' ').filter(Boolean);
	const base = (words.length > 1 ? words.map((word) => word[0]).join('') : title.slice(0, 3)).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'DES';

	let candidate = base;
	let suffix = 2;
	while (await prisma.designation.findFirst({ where: { companyId, code: candidate }, select: { id: true } })) {
		candidate = `${base}${suffix}`;
		suffix += 1;
	}
	return candidate;
}

async function findOrCreateDesignation(companyId: string, title: string) {
	const existing = await prisma.designation.findFirst({
		where: { companyId, title: { equals: title, mode: 'insensitive' }, status: 'Active' },
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
	});
	if (existing) return { designation: existing, created: false };

	const code = await generateDesignationCode(companyId, title);
	try {
		const designation = await prisma.designation.create({
			data: {
				companyId,
				title,
				code,
				status: 'Active',
				description: 'Auto-created from Staff Management position',
			},
		});
		return { designation, created: true };
	} catch (error: any) {
		if (error?.code !== 'P2002') throw error;
		const designation = await prisma.designation.findFirst({
			where: { companyId, title: { equals: title, mode: 'insensitive' }, status: 'Active' },
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		});
		if (!designation) throw error;
		return { designation, created: false };
	}
}

async function makeSharedDesignationUnlimited(staffId: string, designationId: string) {
	const staff = await prisma.staffRecord.findUnique({
		where: { id: staffId },
		select: { departmentId: true },
	});
	if (!staff?.departmentId) return;

	const activeStaffCount = await prisma.staffRecord.count({
		where: { departmentId: staff.departmentId, designationId, isActive: true },
	});
	if (activeStaffCount < 2) return;

	const department = await prisma.department.findUnique({
		where: { id: staff.departmentId },
		select: { positionCapacity: true },
	});
	if (!department) return;

	const positionCapacity = (department.positionCapacity as Record<string, number | null> | null) || {};
	if (positionCapacity[designationId] === null) return;

	await prisma.department.update({
		where: { id: staff.departmentId },
		data: { positionCapacity: { ...positionCapacity, [designationId]: null } },
	});
}

export type ReconcileDesignationInput = {
	staffId: string;
	companyId: string;
	rawPosition: string | null | undefined;
	currentDesignationId?: string | null;
	explicitDesignationId?: string | null;
};

export type ReconcileDesignationResult = {
	changed: boolean;
	designationId: string | null;
	designationTitle: string | null;
	designationCreated: boolean;
};

export async function reconcileStaffDesignationLink({
	staffId,
	companyId,
	rawPosition,
	currentDesignationId = null,
	explicitDesignationId = null,
}: ReconcileDesignationInput): Promise<ReconcileDesignationResult> {
	const title = normalizeDesignationTitle(rawPosition);
	if (!title && !explicitDesignationId) {
		return { changed: false, designationId: currentDesignationId, designationTitle: null, designationCreated: false };
	}

	let designation;
	let designationCreated = false;

	if (explicitDesignationId) {
		designation = await prisma.designation.findFirst({
			where: { id: explicitDesignationId, companyId },
			select: { id: true, title: true },
		});
		if (!designation) throw new Error('The selected designation does not belong to this company.');
	} else {
		const resolved = await findOrCreateDesignation(companyId, title as string);
		designation = resolved.designation;
		designationCreated = resolved.created;
	}

	if (designation.id !== currentDesignationId) {
		await prisma.staffRecord.update({
			where: { id: staffId },
			data: { designationId: designation.id },
		});
	}

	const designationStaffCount = await prisma.staffRecord.count({ where: { designationId: designation.id } });
	await prisma.designation.update({
		where: { id: designation.id },
		data: { staffCount: designationStaffCount },
	});

	if (currentDesignationId && currentDesignationId !== designation.id) {
		const previousStaffCount = await prisma.staffRecord.count({ where: { designationId: currentDesignationId } });
		await prisma.designation
			.update({
				where: { id: currentDesignationId },
				data: { staffCount: previousStaffCount },
			})
			.catch(() => {});
	}

	await makeSharedDesignationUnlimited(staffId, designation.id);

	return {
		changed: designation.id !== currentDesignationId,
		designationId: designation.id,
		designationTitle: designation.title,
		designationCreated,
	};
}
