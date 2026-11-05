// Promotes a candidate into staff_records (StaffRecord) once their recruitment
// Onboarding is ready to convert. Extracted from the former
// onboarding/[id]/complete route so every path that can trigger a hire
// (offer acceptance, the manual "complete onboarding" fallback) converges on
// one implementation instead of duplicating the StaffRecord-creation logic.
import { prisma } from '@/app/lib/db';
import { reconcileStaffDepartmentLink } from '@/app/lib/departments/department-sync';
import { reconcileStaffDesignationLink } from '@/app/lib/designations/designation-sync';
import { sendEmail } from '@/app/lib/email';
import { saveInitialGrossCompensation } from '@/app/lib/staff/gross-compensation';
import { describeIdentifierCollision, findIdentifierHolder } from '@/app/lib/staff/identifierCollision';
import { assertStaffCapacity, recordStaffCreated } from '@/app/lib/trial/guard';

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://247hr.co.uk';

// Derives a job "code" prefix (up to 4 alnum chars) from the job title/department.
function jobCodePrefix(job: { title?: string | null; department?: string | null } | null | undefined): string {
	const source = (job?.title || job?.department || '').replace(/[^a-zA-Z0-9]/g, '');
	const code = source.slice(0, 4).toUpperCase();
	return code || 'EMP';
}

// Auto-generates a unique staff id from the job code + a sequential number,
// e.g. "BUSI-0001". Scans existing ids for the prefix and takes the next number,
// then guards against collisions within the company.
async function generateStaffId(companyId: string, job: any): Promise<string> {
	const prefix = jobCodePrefix(job);
	const existing = await prisma.staffRecord.findMany({
		where: { companyId, staffId: { startsWith: `${prefix}-` } },
		select: { staffId: true },
	});
	let max = 0;
	const re = new RegExp(`^${prefix}-(\\d+)$`);
	for (const s of existing) {
		const m = s.staffId.match(re);
		if (m) max = Math.max(max, parseInt(m[1], 10));
	}
	let n = max + 1;
	let candidate = `${prefix}-${String(n).padStart(4, '0')}`;
	// Defensive: ensure the id isn't already taken in this company.
	// eslint-disable-next-line no-await-in-loop
	while (await prisma.staffRecord.findFirst({ where: { companyId, staffId: candidate }, select: { id: true } })) {
		n += 1;
		candidate = `${prefix}-${String(n).padStart(4, '0')}`;
	}
	return candidate;
}

export class PromoteCandidateError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

export interface PromoteCandidateToStaffParams {
	onboardingId: string;
	companyId: string;
	// Identifier (user id, "system", or a label like "candidate-self-service")
	// stored on createdBy/updatedBy and used for audit sync calls.
	actor: string;
	// Human-readable name for department/designation sync audit trail. Falls
	// back to `actor` when not provided (e.g. public/candidate-triggered accept).
	performedByName?: string;
	// Optional overrides captured at promotion time.
	body?: {
		position?: string;
		department?: string;
		phone?: string;
		bankName?: string;
		accountNumber?: string;
		bvn?: string;
		staffId?: string;
		gross?: unknown;
	};
}

export interface PromoteCandidateToStaffResult {
	staffRecordId: string;
	staffId: string;
	onboardingId: string;
	alreadyCompleted: boolean;
}

export async function promoteCandidateToStaff(
	params: PromoteCandidateToStaffParams
): Promise<PromoteCandidateToStaffResult> {
	const { onboardingId, companyId, actor, body = {} } = params;
	const performedByName = params.performedByName || actor;

	const onboarding = await prisma.onboarding.findFirst({
		where: { id: onboardingId, companyId },
		include: {
			offer: true,
			application: {
				include: {
					candidate: true,
					job: { select: { id: true, title: true, department: true, designationId: true } },
				},
			},
		},
	});
	if (!onboarding) throw new PromoteCandidateError('Onboarding not found', 404);

	// Idempotent — a retry (e.g. the manual fallback route) after a successful
	// auto-trigger should succeed quietly instead of erroring.
	if (onboarding.staffRecordId) {
		const existing = await prisma.staffRecord.findUnique({ where: { id: onboarding.staffRecordId }, select: { id: true, staffId: true } });
		if (existing) return { staffRecordId: existing.id, staffId: existing.staffId, onboardingId, alreadyCompleted: true };
	}

	const offer = onboarding.offer;
	const application = onboarding.application;
	const candidate = application?.candidate;
	if (!candidate) throw new PromoteCandidateError('Onboarding has no candidate to promote', 400);

	const email = candidate.email;
	const job = application?.job;

	// Guard against promoting someone who is already staff in this company.
	// An inactive/offboarded holder doesn't block this — it's surfaced with a
	// message pointing at reactivation instead of a flat "already exists".
	const emailHolder = await findIdentifierHolder(companyId, 'email', email);
	if (emailHolder) {
		throw new PromoteCandidateError(describeIdentifierCollision('email', email, emailHolder), 409);
	}

	const position = String(body.position || job?.title || 'Staff').trim();
	const department = String(body.department || job?.department || 'General').trim();
	const designationId: string | null = job?.designationId || null;

	// Staff ID priority: explicit override → value captured at offer intake →
	// auto-generated from the job code + a sequential number.
	const meta = offer?.metadata && typeof offer.metadata === 'object' ? (offer.metadata as any) : {};
	const staffId =
		String(body.staffId || '').trim() ||
		(meta.staffId ? String(meta.staffId).trim() : '') ||
		(await generateStaffId(companyId, job));

	// Free trial: staff cap.
	await assertStaffCapacity(companyId, 1);

	const created = await prisma.$transaction(async (tx) => {
		const staff = await tx.staffRecord.create({
			data: {
				staffId,
				email,
				firstName: candidate.firstName,
				lastName: candidate.lastName,
				department,
				position,
				phone: body.phone ? String(body.phone).trim() : candidate.phone || undefined,
				bankName: body.bankName ? String(body.bankName).trim() : undefined,
				accountNumber: body.accountNumber ? String(body.accountNumber).trim() : undefined,
				bvn: body.bvn ? String(body.bvn).trim() : undefined,
				companyId,
				createdBy: actor,
				role: 'STAFF',
				isActive: true,
				isRegistered: false,
				requirePasswordChange: true,
				// The moment of promotion is the most accurate "hired" timestamp
				// available for a candidate converting to staff.
				hireDate: new Date(),
				...(designationId ? { designationId } : {}),
			} as any,
		});

		await tx.onboarding.update({
			where: { id: onboardingId },
			data: { status: 'COMPLETED', completedAt: new Date(), staffRecordId: staff.id, updatedBy: actor },
		});

		// Keep the pipeline aligned.
		if (application?.id) {
			await tx.jobApplication.update({ where: { id: application.id }, data: { status: 'HIRED', updatedBy: actor } }).catch(() => {});
		}

		return staff;
	});
	await recordStaffCreated(companyId, created.id);

	// Staff Management is the source of truth for department — auto-
	// create/link the matching Department. A sync hiccup must never block
	// the promotion.
	try {
		await reconcileStaffDepartmentLink(created.id, companyId, created.department, created.departmentId, created.position, actor, performedByName);
		await reconcileStaffDesignationLink({
			staffId: created.id,
			companyId,
			rawPosition: created.position,
			currentDesignationId: created.designationId,
			explicitDesignationId: designationId,
		});
	} catch (syncError) {
		console.error('[PROMOTE_CANDIDATE_TO_STAFF] Department/designation sync error:', syncError);
	}

	// Seed the Compensation profile with Gross when captured — a sync hiccup
	// (e.g. no payroll template configured yet) must never block the promotion.
	try {
		await saveInitialGrossCompensation({
			staffId: created.id,
			companyId,
			gross: body.gross,
			updatedBy: actor,
		});
	} catch (grossError) {
		console.error('[PROMOTE_CANDIDATE_TO_STAFF] Gross compensation seed error:', grossError);
	}

	// ── Send congratulatory welcome email with profile setup link ───────────
	const comp = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } }).catch(() => null);
	const companyName = comp?.companyName || 'the company';
	const staffName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Valued Staff';
	const setupUrl = `${FRONTEND_URL}/complete-registration?email=${encodeURIComponent(email)}&staffId=${encodeURIComponent(created.staffId)}`;

	const welcomeHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 24px; max-width: 560px; margin: 0 auto;">
      <div style="text-align: center; padding: 32px 0 24px; border-bottom: 2px solid #10b981;">
        <h1 style="margin: 0; font-size: 22px; color: #10b981; font-weight: 800;">Welcome to ${companyName}!</h1>
      </div>

      <p style="margin: 24px 0 16px; font-size: 15px;">Dear ${staffName},</p>

      <p style="margin: 12px 0; font-size: 15px; line-height: 1.7;">
        Congratulations on successfully completing your onboarding process.
        We are delighted to officially welcome you to the <strong>${companyName}</strong> team.
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
          <strong>Your Staff ID:</strong> ${created.staffId}
        </p>
        <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
          Click the button below to set up your profile and create your password.
          You will need to set your password before you can log in to the portal.
        </p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${setupUrl}"
             style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none;
                    font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 8px;">
            Set Up Your Profile
          </a>
        </div>
        <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280; text-align: center;">
          If the button does not work, copy and paste this URL into your browser:<br/>
          <span style="word-break: break-all;">${setupUrl}</span>
        </p>
      </div>

      <p style="margin: 16px 0; font-size: 14px; line-height: 1.6;">
        Once your profile is set up, you will have access to your dashboard, payslips,
        leave management, and other employee resources.
      </p>

      <p style="margin: 20px 0 4px; font-size: 14px;">Best regards,</p>
      <p style="margin: 4px 0; font-size: 14px; font-weight: 700;">The ${companyName} Team</p>

      <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center;">
        <p style="margin: 0;">This is an automated message from the 247HR platform. Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

	const welcomeText = `Welcome to ${companyName}!

Dear ${staffName},

Congratulations on successfully completing your onboarding process. We are delighted to officially welcome you to the ${companyName} team.

Your Staff ID: ${created.staffId}

Click the link below to set up your profile and create your password. You will need to set your password before you can log in to the portal.

${setupUrl}

Once your profile is set up, you will have access to your dashboard, payslips, leave management, and other employee resources.

Best regards,
The ${companyName} Team`;

	// Fire-and-forget email send — never block the caller's response.
	sendEmail({
		to: email,
		subject: `🎉 Welcome to ${companyName} — Set Up Your Profile`,
		html: welcomeHtml,
		text: welcomeText,
	})
		.then((r) => {
			if (!r.success) console.error('[PROMOTE_CANDIDATE_TO_STAFF] Welcome email failed:', r.error);
		})
		.catch((err) => console.error('[PROMOTE_CANDIDATE_TO_STAFF] Welcome email error:', err));

	return { staffRecordId: created.id, staffId: created.staffId, onboardingId, alreadyCompleted: false };
}
