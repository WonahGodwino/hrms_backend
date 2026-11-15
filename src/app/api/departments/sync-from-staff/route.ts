// src/app/api/departments/sync-from-staff/route.ts
//
// Manual "backfill" half of the Staff Management -> Department handshake
// (see department-sync.ts). Walks every active StaffRecord in a company and
// reconciles their free-text `department` against a real Department row —
// creating missing departments and relinking `departmentId` as needed.
// The inline hooks on staff create/edit/upload keep this from drifting
// again going forward; this endpoint is for reconciling data that existed
// before those hooks (or before this feature) ever ran.
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { runSyncFromStaff, type SyncProgress, type SyncSummary } from '@/app/lib/departments/sync-from-staff';
import { getUserDisplayName, validateCompanyAccess } from '@/app/lib/departments/department-utils';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

// The sync is a grouped bulk operation (see sync-from-staff.ts) and normally finishes in seconds. For a very large company the
// browser can ask for it to run in the background (`{ async: true }`) and poll GET for progress, so a slow run never hits the
// hosting proxy's request timeout. Job state is held in memory: one job per company, kept for 10 minutes after it finishes. If the
// server restarts mid-run the job is lost, but the sync is idempotent, so running it again is safe.
type Job = {
	status: 'running' | 'completed' | 'failed';
	startedAt: number;
	finishedAt?: number;
	progress: SyncProgress;
	summary?: SyncSummary;
	error?: string;
};
const jobs = new Map<string, Job>();
const KEEP_MS = 10 * 60 * 1000;

function jobView(job: Job | undefined) {
	if (!job) return { status: 'idle' };
	return { status: job.status, startedAt: job.startedAt, finishedAt: job.finishedAt, progress: job.progress, summary: job.summary, error: job.error };
}

async function authorise(request: NextRequest, companyId: string | null) {
	const authHeader = request.headers.get('authorization');
	if (!authHeader) return { error: ApiResponse.error('Authorization header missing', 401) };
	const user = requireRole(authHeader.replace('Bearer ', ''), ['HR', 'SUPER_ADMIN', 'ADMIN']);
	if (!companyId) return { error: ApiResponse.error('companyId is required', 400) };
	const hasAccess = await validateCompanyAccess(user, companyId);
	if (!hasAccess && user.role !== 'SUPER_ADMIN') return { error: ApiResponse.error('Forbidden: No access to this company', 403) };
	return { user };
}

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

// GET /api/departments/sync-from-staff?companyId= — progress of the background run.
export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const companyId = new URL(request.url).searchParams.get('companyId');
		const auth = await authorise(request, companyId);
		if (!auth.user) return withCors(auth.error!, origin);
		return withCors(ApiResponse.success(jobView(jobs.get(companyId as string))), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const body = await request.json().catch(() => ({}));
		const { companyId } = body;
		const auth = await authorise(request, companyId ?? null);
		if (!auth.user) return withCors(auth.error!, origin);
		const performedByName = await getUserDisplayName(auth.user);

		if (body.async) {
			const existing = jobs.get(companyId);
			if (existing?.status === 'running') return withCors(ApiResponse.success(jobView(existing), 'A sync is already running'), origin);

			const job: Job = { status: 'running', startedAt: Date.now(), progress: { phase: 'Starting', done: 0, total: 0 } };
			jobs.set(companyId, job);
			runSyncFromStaff(companyId, auth.user.userId, performedByName, (p) => { job.progress = p; })
				.then((summary) => { job.status = 'completed'; job.summary = summary; })
				.catch((e) => { job.status = 'failed'; job.error = e instanceof Error ? e.message : 'The sync failed.'; })
				.finally(() => {
					job.finishedAt = Date.now();
					setTimeout(() => { if (jobs.get(companyId) === job) jobs.delete(companyId); }, KEEP_MS).unref?.();
				});
			return withCors(ApiResponse.success(jobView(job), 'Sync started'), origin);
		}

		const summary = await runSyncFromStaff(companyId, auth.user.userId, performedByName);
		return withCors(ApiResponse.success(summary, 'Sync from Staff Records completed'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
