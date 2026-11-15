// Self sign-up orchestration behind /api/public/signup/*. Routes stay thin; every
// rule lives here.
//
// Flow:  start -> (email code) -> verify-email
//   - start creates the company and first HR user LOCKED (user inactive, company
//     HELD) and mails a code. Declined sign-ups create nothing.
//   - the 44-day clock starts when the email check passes. A held sign-up
//     verifies its email, then waits for a Super_Admin decision.
//   - There is no phone/SMS verification step. The phone number is still
//     collected and used as a repeat-trial signal, but never verified.
import bcrypt from 'bcryptjs';
// The caller is never told which rule fired.
import crypto from 'crypto';

import { prisma } from '@/app/lib/db';
import { sendEmail } from '@/app/lib/email';
import { seedModuleAccessForCompany } from '@/app/lib/module-access';
import { createNotification } from '@/app/lib/notifications/helpers';
import { seedDefaultPayslipPreset } from '@/app/lib/payroll/seed-default-payslip-preset';

import { TRIAL_LENGTH_DAYS, TRIAL_MODULE_KEYS } from '../limits';
import {
    CODE_TTL_MS, codesMatch, generateSignupCode, hashSignupCode, MAX_CODE_ATTEMPTS
} from './codes';
import { RcVerdict, verifyRc } from './cac';
import {
    domainCanReceiveMail, emailDomain, isDisposableEmail, isFreeMailDomain
} from './disposable';
import { canonicalEmail, domainAgeDays, hardEmailRisk } from './email-risk';
import {
    hashSignal, normalizeCompanyName, normalizePersonName, normalizePhone,
    normalizeRcNumber, normalizeTaxId, personNameSimilarity, SignalKind, similarity
} from './normalize';
import { checkResendLimit, checkStartLimits, checkVerifyLimit } from './rate-limit';
import { RiskSignals, scoreSignup } from './score';

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNAL_RETENTION_MS = 24 * 30 * DAY_MS; // ~24 months
const NETWORK_WINDOW_MS = 7 * DAY_MS;
const NAME_SIMILARITY_THRESHOLD = 0.85;
const PERSON_NAME_SIMILARITY_THRESHOLD = 0.85;
const NEW_DOMAIN_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SignupError extends Error {
	status: number;
	extra?: Record<string, any>;
	constructor(message: string, status = 400, extra?: Record<string, any>) {
		super(message);
		this.name = 'SignupError';
		this.status = status;
		this.extra = extra;
	}
}

export type SignupStatus = 'VERIFY_EMAIL' | 'TRIAL_STARTED' | 'HELD' | 'DECLINED';

export interface SignupContext {
	ip: string;
	deviceId: string | null;
}

export interface StartSignupInput {
	companyName?: string;
	registrationNumber?: string;
	taxId?: string;
	industry?: string;
	companyEmail?: string;
	phone?: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	password?: string;
	termsAccepted?: boolean;
}

const BAD_CODE = 'That code is incorrect or has expired.';

function s(v: unknown): string {
	return typeof v === 'string' ? v.trim() : '';
}

function expiry() {
	return new Date(Date.now() + CODE_TTL_MS);
}

async function sendEmailCode(to: string, firstName: string, code: string): Promise<boolean> {
	const minutes = Math.round(CODE_TTL_MS / 60_000);
	const res = await sendEmail({
		to,
		subject: `Your 247HR verification code: ${code}`,
		text: `Hi ${firstName},\n\nYour 247HR verification code is ${code}. It expires in ${minutes} minutes.\n\nIf you did not start a 247HR trial, you can ignore this email.`,
		html: `<p>Hi ${firstName},</p><p>Your 247HR verification code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${minutes} minutes. If you did not start a 247HR trial, you can ignore this email.</p>`,
	});
	return res.success;
}

// ── Signals ──────────────────────────────────────────────────────────────────

// Only signals from sign-ups that verified their email count: an abandoned or
// mistyped attempt must not flag the person's next try as a repeat trial.
async function hasSignal(kind: SignalKind, hash: string, since?: Date): Promise<boolean> {
	const row = await prisma.trialSignal.findFirst({
		where: {
			kind,
			valueHash: hash,
			expiresAt: { gt: new Date() },
			...(since ? { createdAt: { gte: since } } : {}),
			company: { emailVerifiedAt: { not: null } },
		},
		select: { id: true },
	});
	return !!row;
}

// Same person name (titles and word order ignored) already used with another email. Looks at
// verified self sign-ups (hashed signal, exact) and at HR staff of any company (exact + fuzzy).
async function personNameMatch(firstName: string, lastName: string): Promise<{ exact: boolean; similar: boolean }> {
	const normalized = normalizePersonName(firstName, lastName);
	if (!normalized) return { exact: false, similar: false };
	if (await hasSignal('HR_NAME', hashSignal('HR_NAME', normalized))) return { exact: true, similar: true };

	const tokens = normalized.split(' ').filter((t) => t.length >= 2);
	if (!tokens.length) return { exact: false, similar: false };
	const candidates = await prisma.staffRecord.findMany({
		where: {
			role: 'HR',
			company: { NOT: { createdBy: 'SELF_SIGNUP', emailVerifiedAt: null } },
			OR: tokens.flatMap((t) => [
				{ firstName: { contains: t, mode: 'insensitive' as const } },
				{ lastName: { contains: t, mode: 'insensitive' as const } },
			]),
		},
		select: { firstName: true, lastName: true },
		take: 500,
	});
	let similar = false;
	for (const c of candidates) {
		const other = normalizePersonName(c.firstName || '', c.lastName || '');
		if (!other) continue;
		if (other === normalized) return { exact: true, similar: true };
		if (personNameSimilarity(other, normalized) >= PERSON_NAME_SIMILARITY_THRESHOLD) similar = true;
	}
	return { exact: false, similar };
}

async function gatherSignals(input: {
	companyName: string;
	rc: string;
	taxId: string;
	phone: string;
	firstName: string;
	lastName: string;
	hrEmail: string;
	companyEmail: string;
	ip: string;
	deviceId: string | null;
	rcUnverified: boolean;
}): Promise<RiskSignals> {
	const hrDomain = emailDomain(input.hrEmail);
	const companyDomain = emailDomain(input.companyEmail);
	const disposableEmail = isDisposableEmail(input.hrEmail) || isDisposableEmail(input.companyEmail);
	const badEmail = !!hardEmailRisk(input.hrEmail, { allowRole: false }) || !!hardEmailRisk(input.companyEmail, { allowRole: true });

	// Custom domains must be able to receive mail and should not be brand new; free-mail providers always can.
	const customDomains = [...new Set([hrDomain, companyDomain].filter((d) => d && !isFreeMailDomain(d)))];
	const [mailable, ages] = await Promise.all([
		Promise.all(customDomains.map((d) => domainCanReceiveMail(d))),
		Promise.all(customDomains.map((d) => domainAgeDays(d))),
	]);
	const domainNoMail = mailable.some((ok) => !ok);
	const domainVeryNew = ages.some((a) => a !== null && a < NEW_DOMAIN_DAYS);

	const recent = new Date(Date.now() - NETWORK_WINDOW_MS);
	const [rcSignal, phoneSignal, taxSignal, deviceSignal, networkSignal, rcLegacy, phoneLegacy, names, nameMatch] = await Promise.all([
		input.rc ? hasSignal('RC_NUMBER', hashSignal('RC_NUMBER', input.rc)) : false,
		hasSignal('PHONE', hashSignal('PHONE', input.phone)),
		input.taxId ? hasSignal('TAX_ID', hashSignal('TAX_ID', input.taxId)) : false,
		input.deviceId ? hasSignal('DEVICE', hashSignal('DEVICE', input.deviceId)) : false,
		hasSignal('IP', hashSignal('IP', input.ip), recent),
		// Companies registered before self sign-up existed carry raw values.
		input.rc
			? prisma.company.findFirst({
					where: {
						OR: [input.rc, `RC${input.rc}`, `RC ${input.rc}`, `RC-${input.rc}`].map((v) => ({
							rcNumber: { equals: v, mode: 'insensitive' as const },
						})),
					},
					select: { id: true },
			  })
			: null,
		prisma.company.findFirst({
			where: { phone: { contains: input.phone.slice(-10) } },
			select: { id: true },
		}),
		prisma.company.findMany({ select: { companyName: true }, take: 5000 }),
		personNameMatch(input.firstName, input.lastName),
	]);

	const wanted = normalizeCompanyName(input.companyName);
	const similarCompanyName = !!wanted && names.some((c) => similarity(c.companyName, input.companyName) >= NAME_SIMILARITY_THRESHOLD);

	return {
		disposableEmail,
		badEmail,
		domainNoMail,
		domainVeryNew,
		rcNumberReused: rcSignal || !!rcLegacy,
		rcUnverified: input.rcUnverified,
		phoneReused: phoneSignal || !!phoneLegacy,
		taxIdReused: taxSignal,
		sameDevice: deviceSignal,
		sameNetworkRecent: networkSignal,
		similarCompanyName,
		hrNameExact: nameMatch.exact,
		hrNameSimilar: nameMatch.similar,
		freeMailAddress: isFreeMailDomain(hrDomain),
		companyDomainEmail: !isFreeMailDomain(hrDomain) && !disposableEmail && !badEmail,
	};
}

function signalRows(companyId: string, v: Partial<Record<SignalKind, string | null>>) {
	const expiresAt = new Date(Date.now() + SIGNAL_RETENTION_MS);
	return (Object.keys(v) as SignalKind[]).filter((k) => v[k]).map((kind) => ({ companyId, kind, valueHash: hashSignal(kind, v[kind] as string), expiresAt }));
}

// ── start ────────────────────────────────────────────────────────────────────

type Db = Pick<typeof prisma, 'staffRecord' | 'company' | 'trialSignal'>;

// One mailbox, one account: exact and canonical (dots/+tag removed for Gmail) matches count,
// as do verified earlier sign-ups, so an alias of an existing address is refused too.
async function assertEmailsFree(db: Db, hrEmail: string, hrCanon: string, companyEmail: string) {
	const [taken, companyTaken, canonSignal] = await Promise.all([
		db.staffRecord.findFirst({ where: { email: { in: [...new Set([hrEmail, hrCanon])] } }, select: { id: true } }),
		db.company.findFirst({ where: { email: { in: [companyEmail, hrEmail] } }, select: { id: true } }),
		db.trialSignal.findFirst({
			where: {
				kind: 'EMAIL_CANON',
				valueHash: hashSignal('EMAIL_CANON', hrCanon),
				expiresAt: { gt: new Date() },
				company: { emailVerifiedAt: { not: null } },
			},
			select: { id: true },
		}),
	]);
	if (taken || companyTaken || canonSignal) {
		throw new SignupError('An account with this email already exists. Try logging in instead.', 409);
	}
}

export async function startSignup(input: StartSignupInput, ctx: SignupContext) {
	const companyName = s(input.companyName);
	const companyEmail = s(input.companyEmail).toLowerCase();
	const hrEmail = s(input.email).toLowerCase();
	const firstName = s(input.firstName);
	const lastName = s(input.lastName);
	const phone = normalizePhone(s(input.phone));
	const rc = normalizeRcNumber(s(input.registrationNumber));
	const taxId = normalizeTaxId(s(input.taxId));
	const password = typeof input.password === 'string' ? input.password : '';

	if (!companyName || !firstName || !lastName || !rc) throw new SignupError('Please complete all required fields.');
	if (!EMAIL_RE.test(companyEmail) || !EMAIL_RE.test(hrEmail)) throw new SignupError('Please enter valid email addresses.');
	if (companyEmail === hrEmail) throw new SignupError('Use a different address for the company and the HR account.');
	if (phone.replace(/\D/g, '').length < 10) throw new SignupError('Please enter a valid phone number.');
	if (password.length < 8) throw new SignupError('Password must be at least 8 characters.');
	if (input.termsAccepted !== true) throw new SignupError('Please accept the terms to continue.');

	const wait = checkStartLimits({ ip: ctx.ip, deviceId: ctx.deviceId, email: hrEmail });
	if (wait > 0) throw new SignupError('Too many attempts. Please try again later.', 429, { retryAfter: wait });

	// A half-finished sign-up with this email (never verified) is replaced, so a
	// typo or lost code never locks the person out of trying again.
	const pending = await prisma.staffRecord.findFirst({
		where: { email: hrEmail, isActive: false, company: { createdBy: 'SELF_SIGNUP', emailVerifiedAt: null } },
		select: { companyId: true },
	});
	if (pending) await prisma.company.delete({ where: { id: pending.companyId } });

	const hrCanon = canonicalEmail(hrEmail);
	await assertEmailsFree(prisma, hrEmail, hrCanon, companyEmail);

	// Obviously fake sign-ups (test/role/look-alike addresses, made-up RC numbers) are declined
	// with the same generic result as every other decline; the real reason is logged only.
	const emailRisk = hardEmailRisk(hrEmail, { allowRole: false }) || hardEmailRisk(companyEmail, { allowRole: true });
	// The (possibly paid) CAC lookup only runs once the free checks have passed.
	const rcCheck: RcVerdict = emailRisk ? { verdict: 'self_declared' } : await verifyRc(rc, companyName);
	if (emailRisk || rcCheck.verdict === 'rejected') {
		console.warn('[signup] declined at validation:', emailRisk || (rcCheck.verdict === 'rejected' ? rcCheck.reason : ''));
		return { status: 'DECLINED' as SignupStatus };
	}

	const signals = await gatherSignals({
		companyName,
		rc,
		taxId,
		phone,
		firstName,
		lastName,
		hrEmail,
		companyEmail,
		ip: ctx.ip,
		deviceId: ctx.deviceId,
		rcUnverified: rcCheck.verdict === 'unavailable',
	});
	const risk = scoreSignup(signals);
	if (risk.decision === 'DECLINE') return { status: 'DECLINED' as SignupStatus };
	// What the reviewer needs to know about the CAC check.
	if (rcCheck.verdict === 'verified') risk.reasons.push(`CAC verified: ${rcCheck.registeredName} (${rcCheck.status})`);
	else if (rcCheck.verdict === 'self_declared') risk.reasons.push('RC number passed format checks only; not confirmed with CAC');
	else if (rcCheck.verdict === 'unavailable') risk.reasons.push(`CAC lookup unavailable (${rcCheck.reason})`);

	const hashedPassword = await bcrypt.hash(password, 10);
	const code = generateSignupCode();

	const { company, signupId } = await prisma.$transaction(async (tx) => {
		// Serialise sign-ups for the same mailbox, then re-check inside the lock so two
		// simultaneous requests cannot both pass.
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hashSignal('EMAIL_CANON', hrCanon)}))`;
		await assertEmailsFree(tx, hrEmail, hrCanon, companyEmail);

		const company = await tx.company.create({
			data: {
				companyName,
				rcNumber: s(input.registrationNumber) || null,
				taxId: s(input.taxId) || null,
				industry: s(input.industry) || null,
				email: companyEmail,
				phone,
				status: 'Active',
				createdBy: 'SELF_SIGNUP',
				archived: 0,
				// Locked until the email check passes; the trial clock has not started.
				trialStatus: 'HELD',
				trialLimitsProfile: 'standard',
			},
		});

		const staff = await tx.staffRecord.create({
			data: {
				staffId: `HR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
				email: hrEmail,
				firstName,
				lastName,
				phone,
				department: 'Administration',
				position: 'HR',
				password: hashedPassword,
				isRegistered: true,
				isActive: false,
				requirePasswordChange: false,
				role: 'HR',
				companyId: company.id,
				createdBy: 'SELF_SIGNUP',
			},
		});
		await tx.userCompany.create({
			data: { userId: staff.id, companyId: company.id, role: 'HR', createdBy: 'SELF_SIGNUP' },
		});

		const verification = await tx.signupVerification.create({
			data: {
				companyId: company.id,
				userId: staff.id,
				email: hrEmail,
				phone,
				emailCodeExpiresAt: expiry(),
				riskScore: risk.score,
				riskDecision: risk.decision,
				riskReasons: risk.reasons,
				ipHash: hashSignal('IP', ctx.ip),
				deviceHash: ctx.deviceId ? hashSignal('DEVICE', ctx.deviceId) : null,
			},
		});
		await tx.signupVerification.update({
			where: { id: verification.id },
			data: { emailCodeHash: hashSignupCode(verification.id, 'email', code) },
		});

		await tx.trialSignal.createMany({
			data: signalRows(company.id, {
				EMAIL_DOMAIN: isFreeMailDomain(emailDomain(hrEmail)) ? null : emailDomain(hrEmail),
				PHONE: phone,
				RC_NUMBER: rc || null,
				TAX_ID: taxId || null,
				EMAIL_CANON: hrCanon,
				HR_NAME: normalizePersonName(firstName, lastName) || null,
				DEVICE: ctx.deviceId,
				IP: ctx.ip,
				COMPANY_NAME: normalizeCompanyName(companyName) || null,
			}),
		});

		return { company, signupId: verification.id };
	});

	// Best-effort seeding, same as the admin register flow; never blocks sign-up.
	try {
		await prisma.aISettings.create({
			data: {
				companyId: company.id,
				enabled: true,
				monthlyBudget: 100.0,
				costPerReview: 0.02,
				costAlertThreshold: 80,
				defaultService: 'openai',
				defaultModel: 'gpt-3.5-turbo',
				autoShortlistThreshold: 75,
				useForSeniorRoles: true,
				useForTechnicalRoles: true,
				useForManagerRoles: true,
				updatedBy: 'SELF_SIGNUP',
			},
		});
	} catch (e) {
		console.warn('[signup] AI settings seed failed:', e);
	}
	try {
		await seedModuleAccessForCompany(company.id, TRIAL_MODULE_KEYS);
	} catch (e) {
		console.warn('[signup] module access seed failed:', e);
	}
	try {
		await seedDefaultPayslipPreset(company.id, 'SELF_SIGNUP');
	} catch (e) {
		console.warn('[signup] payslip preset seed failed:', e);
	}

	const sent = await sendEmailCode(hrEmail, firstName, code);
	if (!sent) console.error('[signup] verification email failed for', signupId);

	// A held sign-up looks identical to the person; they only learn the outcome after verifying.
	return { status: 'VERIFY_EMAIL' as SignupStatus, signupId };
}

// ── verify-email ─────────────────────────────────────────────────────────────

async function loadVerification(signupId: unknown) {
	const id = s(signupId);
	if (!id) throw new SignupError(BAD_CODE, 400);
	const v = await prisma.signupVerification.findUnique({ where: { id } });
	if (!v) throw new SignupError(BAD_CODE, 400);
	return v;
}

export async function verifyEmail(signupId: unknown, code: unknown) {
	const v = await loadVerification(signupId);
	const wait = checkVerifyLimit(v.id);
	if (wait > 0) throw new SignupError('Too many attempts. Please try again later.', 429, { retryAfter: wait });

	if (v.emailVerifiedAt) return completedOutcome(v);

	const supplied = s(code);
	if (!v.emailCodeHash || !v.emailCodeExpiresAt || v.emailCodeExpiresAt < new Date() || v.emailAttempts >= MAX_CODE_ATTEMPTS) {
		throw new SignupError('This code has expired. Please request a new one.', 400);
	}
	if (!/^\d{6}$/.test(supplied) || !codesMatch(v.emailCodeHash, v.id, 'email', supplied)) {
		await prisma.signupVerification.update({ where: { id: v.id }, data: { emailAttempts: { increment: 1 } } });
		throw new SignupError(BAD_CODE, 400);
	}

	return completeSignup(v, { verifyEmailNow: true });
}

type VerificationRow = Awaited<ReturnType<typeof loadVerification>>;

// The email check is the last step: start the trial, or queue a held sign-up
// for Super_Admin review. `verifyEmailNow` is false only when finishing a
// sign-up whose email was verified under the old two-step (email + SMS) flow.
async function completeSignup(v: VerificationRow, { verifyEmailNow }: { verifyEmailNow: boolean }) {
	const now = new Date();
	const hold = v.riskDecision === 'HOLD';
	const trialEndsAt = new Date(now.getTime() + TRIAL_LENGTH_DAYS * DAY_MS);

	await prisma.$transaction([
		prisma.signupVerification.update({
			where: { id: v.id },
			data: verifyEmailNow ? { emailVerifiedAt: now, emailCodeHash: null, emailAttempts: 0 } : {},
		}),
		prisma.company.update({
			where: { id: v.companyId },
			data: {
				...(verifyEmailNow ? { emailVerifiedAt: now } : {}),
				...(hold ? {} : { trialStatus: 'TRIAL', trialStartsAt: now, trialEndsAt }),
			},
		}),
		prisma.staffRecord.update({ where: { id: v.userId }, data: { isActive: true } }),
		...(hold
			? [
					prisma.trialReview.create({
						data: {
							companyId: v.companyId,
							score: v.riskScore,
							reasons: (v.riskReasons ?? []) as any,
						},
					}),
			  ]
			: []),
	]);

	if (hold) await notifySuperAdmins(v.companyId, v.riskScore);
	return hold ? { status: 'HELD' as SignupStatus } : { status: 'TRIAL_STARTED' as SignupStatus, trialEndsAt: trialEndsAt.toISOString() };
}

// Email already verified (a repeat submit, or a sign-up that stopped at the
// old SMS step before it was removed): report where it stands, finishing it
// first if it never got past the SMS step.
async function completedOutcome(v: VerificationRow) {
	const c = await prisma.company.findUnique({
		where: { id: v.companyId },
		select: { trialStatus: true, trialStartsAt: true, trialEndsAt: true },
	});
	if (c?.trialStartsAt || (c && c.trialStatus !== 'HELD')) {
		return { status: 'TRIAL_STARTED' as SignupStatus, trialEndsAt: c?.trialEndsAt?.toISOString() };
	}
	const queued = await prisma.trialReview.findFirst({ where: { companyId: v.companyId }, select: { id: true } });
	if (queued) return { status: 'HELD' as SignupStatus };
	return completeSignup(v, { verifyEmailNow: false });
}

async function notifySuperAdmins(companyId: string, score: number) {
	try {
		const company = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } });
		const admins = await prisma.staffRecord.findMany({
			where: { role: 'SUPER_ADMIN', isActive: true },
			select: { id: true, companyId: true },
		});
		await Promise.all(
			admins.map((a) =>
				createNotification(
					a.id,
					'TRIAL_REVIEW',
					'Trial awaiting review',
					`${company?.companyName ?? 'A new company'} was held for review (risk score ${score}).`,
					{ trialCompanyId: companyId, score },
					a.companyId
				)
			)
		);
	} catch (e) {
		console.warn('[signup] could not notify super admins:', e);
	}
}

// ── resend ───────────────────────────────────────────────────────────────────

export async function resendCode(signupId: unknown, channel: unknown) {
	// Only email codes exist; phone/SMS verification was removed.
	if (channel !== 'email') throw new SignupError('Unknown channel.', 400);
	const v = await loadVerification(signupId);
	const wait = checkResendLimit(v.id, channel);
	if (wait > 0) throw new SignupError('Please wait before requesting another code.', 429, { retryAfter: wait });
	if (v.emailVerifiedAt) throw new SignupError('Email already verified.', 400);

	const code = generateSignupCode();
	await prisma.signupVerification.update({
		where: { id: v.id },
		data: { emailCodeHash: hashSignupCode(v.id, 'email', code), emailCodeExpiresAt: expiry(), emailAttempts: 0 },
	});
	const staff = await prisma.staffRecord.findUnique({ where: { id: v.userId }, select: { firstName: true } });
	if (!(await sendEmailCode(v.email, staff?.firstName ?? 'there', code))) {
		throw new SignupError('We could not send the email. Please try again shortly.', 502);
	}
	return { sent: true };
}
