// POST /api/meetings/:id/participants — add one staff or external participant.
import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { notifyMeetingParticipants } from '@/app/lib/meetings/notify';
import { hasModuleAccess } from '@/app/lib/module-access';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF'];
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

async function loadMeeting(id: string, user: any) {
	const meeting = await (prisma as any).meeting.findUnique({
		where: { id },
		include: { participants: true },
	});
	if (!meeting) return { error: { message: 'Meeting not found', status: 404 } as const };
	if (!(await hasModuleAccess(meeting.companyId, 'MEETINGS'))) {
		return { error: { message: 'This module is not available for your organisation', status: 403 } as const };
	}
	const isHost = meeting.participants.some((p: any) => p.staffId === user.userId && p.role === 'HOST');
	const isPrivileged = PRIVILEGED.includes(user.role) && (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId));
	const canManage = isHost || isPrivileged || meeting.createdBy === user.userId;
	if (!canManage) return { error: { message: 'Only the host can manage participants', status: 403 } as const };
	return { meeting };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireRoleAsync(token, ROLES);
		const { id } = await params;
		const body = await req.json().catch(() => ({}));
		const loaded = await loadMeeting(id, user);
		if (loaded.error) return withCors(ApiResponse.error(loaded.error.message, loaded.error.status), origin);

		const staffId = body?.staffId ? String(body.staffId).trim() : '';
		const externalEmail = body?.externalEmail ? String(body.externalEmail).trim().toLowerCase() : '';
		const externalName = body?.externalName ? String(body.externalName).trim() : null;
		if ((staffId && externalEmail) || (!staffId && !externalEmail)) {
			return withCors(ApiResponse.error('Provide exactly one staffId or externalEmail', 400), origin);
		}
		if (externalEmail && !EMAIL_RE.test(externalEmail)) {
			return withCors(ApiResponse.error('A valid external participant email is required', 400), origin);
		}
		if (loaded.meeting.status === 'ENDED' || loaded.meeting.status === 'CANCELLED') {
			return withCors(ApiResponse.error('Participants cannot be added to an inactive meeting', 409), origin);
		}

		let participantData: any;
		let addedStaff: { firstName: string; lastName: string; email: string } | null = null;
		if (staffId) {
			const staff = await prisma.staffRecord.findFirst({
				where: { id: staffId, companyId: loaded.meeting.companyId },
				select: { id: true, firstName: true, lastName: true, email: true },
			});
			if (!staff) return withCors(ApiResponse.error('Staff member was not found in this company', 404), origin);
			addedStaff = staff;
			participantData = { staffId: staff.id, externalName: null, externalEmail: null, role: 'ATTENDEE' };
		} else {
			participantData = { staffId: null, externalName, externalEmail, role: 'ATTENDEE' };
		}

		const duplicate = loaded.meeting.participants.find(
			(p: any) => (staffId && p.staffId === staffId) || (externalEmail && String(p.externalEmail || '').toLowerCase() === externalEmail)
		);
		if (duplicate) return withCors(ApiResponse.error('This participant is already invited to the meeting', 409), origin);

		const participant = await (prisma as any).meetingParticipant.create({
			data: { meetingId: id, ...participantData },
		});
		const emailDelivery = await notifyMeetingParticipants(id, 'created', {
			triggeredBy: user.userId,
			participantId: participant.id,
		});

		return withCors(
			ApiResponse.success(
				{
					participant: {
						id: participant.id,
						staffId: participant.staffId,
						externalName: participant.externalName,
						externalEmail: participant.externalEmail,
						role: participant.role,
						staffName: addedStaff ? `${addedStaff.firstName} ${addedStaff.lastName}`.trim() : null,
						staffEmail: addedStaff?.email || null,
					},
					emailDelivery,
				},
				'Participant added'
			),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
