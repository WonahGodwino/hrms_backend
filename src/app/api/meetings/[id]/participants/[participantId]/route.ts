// DELETE /api/meetings/:id/participants/:participantId — revoke access.
import { NextRequest } from 'next/server';

import { requireRoleAsync } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { getMeetingProvider } from '@/app/lib/meetings/provider';
import { hasModuleAccess } from '@/app/lib/module-access';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF'];
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN'];

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; participantId: string }> }) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireRoleAsync(token, ROLES);
		const { id, participantId } = await params;
		const meeting: any = await (prisma as any).meeting.findUnique({ where: { id }, include: { participants: true } });
		if (!meeting) return withCors(ApiResponse.error('Meeting not found', 404), origin);
		if (!(await hasModuleAccess(meeting.companyId, 'MEETINGS'))) {
			return withCors(ApiResponse.error('This module is not available for your organisation', 403), origin);
		}

		const isHost = meeting.participants.some((p: any) => p.staffId === user.userId && p.role === 'HOST');
		const isPrivileged = PRIVILEGED.includes(user.role) && (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId));
		if (!isHost && !isPrivileged && meeting.createdBy !== user.userId) {
			return withCors(ApiResponse.error('Only the host can manage participants', 403), origin);
		}

		const participant = meeting.participants.find((p: any) => p.id === participantId);
		if (!participant) return withCors(ApiResponse.error('Participant not found', 404), origin);
		if (participant.role === 'HOST' || participant.staffId === user.userId) {
			return withCors(ApiResponse.error('The host cannot be removed from the meeting', 400), origin);
		}

		// Remove the provider identity before deleting the row. Provider removal is
		// best-effort so a stale/disconnected participant cannot block revocation.
		const provider = getMeetingProvider();
		if (provider.isConfigured() && meeting.status === 'LIVE') {
			const identity = participant.staffId ? `u_${participant.staffId}` : `p_${participant.id}`;
			await provider.removeParticipant(meeting.roomName, identity).catch(() => {});
		}
		await (prisma as any).meetingParticipant.delete({ where: { id: participantId } });

		return withCors(ApiResponse.success({ participantId, revoked: true }, 'Participant access revoked'), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
