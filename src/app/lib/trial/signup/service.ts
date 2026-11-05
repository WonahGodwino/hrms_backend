// Self sign-up orchestration behind /api/public/signup/*. Routes stay thin; every
// rule lives here.
//
// Flow:  start -> (email code) -> verify-email -> (SMS code) -> verify-phone
//   - start creates the company and first HR user LOCKED (user inactive, company
//     HELD) and mails a code. Declined sign-ups create nothing.
//   - the 44-day clock starts only when the phone check passes. A held sign-up
//     finishes both checks, then waits for a Super_Admin decision.
// The caller is never told which rule fired.
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { sendEmail } from '@/app/lib/email'
import { createNotification } from '@/app/lib/notifications/helpers'
import { seedModuleAccessForCompany } from '@/app/lib/module-access'
import { seedDefaultPayslipPreset } from '@/app/lib/payroll/seed-default-payslip-preset'
import { TRIAL_LENGTH_DAYS } from '../limits'
import { emailDomain, isDisposableEmail, isFreeMailDomain, domainCanReceiveMail } from './disposable'
import {
  hashSignal,
  normalizeCompanyName,
  normalizePhone,
  normalizeRcNumber,
  normalizeTaxId,
  similarity,
  type SignalKind,
} from './normalize'
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS, codesMatch, generateSignupCode, hashSignupCode } from './codes'
import { checkResendLimit, checkStartLimits, checkVerifyLimit } from './rate-limit'
import { limitsProfileFor, scoreSignup, type RiskSignals } from './score'
import { getSmsProvider } from './sms'
import { TRIAL_MODULE_KEYS } from '../limits'

const DAY_MS = 24 * 60 * 60 * 1000
const SIGNAL_RETENTION_MS = 24 * 30 * DAY_MS // ~24 months
const NETWORK_WINDOW_MS = 7 * DAY_MS
const NAME_SIMILARITY_THRESHOLD = 0.85
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class SignupError extends Error {
  status: number
  extra?: Record<string, any>
  constructor(message: string, status = 400, extra?: Record<string, any>) {
    super(message)
    this.name = 'SignupError'
    this.status = status
    this.extra = extra
  }
}

export type SignupStatus = 'VERIFY_EMAIL' | 'VERIFY_PHONE' | 'TRIAL_STARTED' | 'HELD' | 'DECLINED'

export interface SignupContext {
  ip: string
  deviceId: string | null
}

export interface StartSignupInput {
  companyName?: string
  registrationNumber?: string
  taxId?: string
  industry?: string
  companyEmail?: string
  phone?: string
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  termsAccepted?: boolean
}

const BAD_CODE = 'That code is incorrect or has expired.'

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function expiry() {
  return new Date(Date.now() + CODE_TTL_MS)
}

async function sendEmailCode(to: string, firstName: string, code: string): Promise<boolean> {
  const minutes = Math.round(CODE_TTL_MS / 60_000)
  const res = await sendEmail({
    to,
    subject: `Your 247HR verification code: ${code}`,
    text: `Hi ${firstName},\n\nYour 247HR verification code is ${code}. It expires in ${minutes} minutes.\n\nIf you did not start a 247HR trial, you can ignore this email.`,
    html: `<p>Hi ${firstName},</p><p>Your 247HR verification code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${minutes} minutes. If you did not start a 247HR trial, you can ignore this email.</p>`,
  })
  return res.success
}

async function sendSmsCode(to: string, code: string): Promise<boolean> {
  const minutes = Math.round(CODE_TTL_MS / 60_000)
  const res = await getSmsProvider().send(to, `Your 247HR verification code is ${code}. It expires in ${minutes} minutes.`)
  if (!res.ok) console.error('[signup] SMS failed:', res.error)
  return res.ok
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
  })
  return !!row
}

async function gatherSignals(input: {
  companyName: string
  rc: string
  phone: string
  hrEmail: string
  companyEmail: string
  ip: string
  deviceId: string | null
}): Promise<RiskSignals> {
  const hrDomain = emailDomain(input.hrEmail)
  const companyDomain = emailDomain(input.companyEmail)
  const disposableEmail = isDisposableEmail(input.hrEmail) || isDisposableEmail(input.companyEmail)

  // Custom domains must be able to receive mail; free-mail providers always can.
  const customDomains = [...new Set([hrDomain, companyDomain].filter((d) => d && !isFreeMailDomain(d)))]
  const mailable = await Promise.all(customDomains.map((d) => domainCanReceiveMail(d)))
  const domainNoMailOrVeryNew = mailable.some((ok) => !ok)

  const recent = new Date(Date.now() - NETWORK_WINDOW_MS)
  const [rcSignal, phoneSignal, deviceSignal, networkSignal, rcLegacy, phoneLegacy, names] = await Promise.all([
    input.rc ? hasSignal('RC_NUMBER', hashSignal('RC_NUMBER', input.rc)) : false,
    hasSignal('PHONE', hashSignal('PHONE', input.phone)),
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
  ])

  const wanted = normalizeCompanyName(input.companyName)
  const similarCompanyName =
    !!wanted && names.some((c) => similarity(c.companyName, input.companyName) >= NAME_SIMILARITY_THRESHOLD)

  return {
    disposableEmail,
    domainNoMailOrVeryNew,
    rcNumberReused: rcSignal || !!rcLegacy,
    phoneReused: phoneSignal || !!phoneLegacy,
    sameDevice: deviceSignal,
    sameNetworkRecent: networkSignal,
    similarCompanyName,
    freeMailAddress: isFreeMailDomain(hrDomain),
    hasRcNumber: !!input.rc,
    companyDomainEmail: !isFreeMailDomain(hrDomain) && !disposableEmail,
  }
}

function signalRows(companyId: string, v: Record<SignalKind, string | null>) {
  const expiresAt = new Date(Date.now() + SIGNAL_RETENTION_MS)
  return (Object.keys(v) as SignalKind[])
    .filter((k) => v[k])
    .map((kind) => ({ companyId, kind, valueHash: hashSignal(kind, v[kind] as string), expiresAt }))
}

// ── start ────────────────────────────────────────────────────────────────────

export async function startSignup(input: StartSignupInput, ctx: SignupContext) {
  const companyName = s(input.companyName)
  const companyEmail = s(input.companyEmail).toLowerCase()
  const hrEmail = s(input.email).toLowerCase()
  const firstName = s(input.firstName)
  const lastName = s(input.lastName)
  const phone = normalizePhone(s(input.phone))
  const rc = normalizeRcNumber(s(input.registrationNumber))
  const taxId = normalizeTaxId(s(input.taxId))
  const password = typeof input.password === 'string' ? input.password : ''

  if (!companyName || !firstName || !lastName) throw new SignupError('Please complete all required fields.')
  if (!EMAIL_RE.test(companyEmail) || !EMAIL_RE.test(hrEmail)) throw new SignupError('Please enter valid email addresses.')
  if (phone.replace(/\D/g, '').length < 10) throw new SignupError('Please enter a valid phone number.')
  if (password.length < 8) throw new SignupError('Password must be at least 8 characters.')
  if (input.termsAccepted !== true) throw new SignupError('Please accept the terms to continue.')

  const wait = checkStartLimits({ ip: ctx.ip, deviceId: ctx.deviceId, email: hrEmail })
  if (wait > 0) throw new SignupError('Too many attempts. Please try again later.', 429, { retryAfter: wait })

  // A half-finished sign-up with this email (never verified) is replaced, so a
  // typo or lost code never locks the person out of trying again.
  const pending = await prisma.staffRecord.findFirst({
    where: { email: hrEmail, isActive: false, company: { createdBy: 'SELF_SIGNUP', emailVerifiedAt: null } },
    select: { companyId: true },
  })
  if (pending) await prisma.company.delete({ where: { id: pending.companyId } })

  const taken = await prisma.staffRecord.findFirst({ where: { email: hrEmail }, select: { id: true } })
  const companyTaken = await prisma.company.findFirst({ where: { email: companyEmail }, select: { id: true } })
  if (taken || companyTaken) {
    throw new SignupError('An account with this email already exists. Try logging in instead.', 409)
  }

  const signals = await gatherSignals({
    companyName,
    rc,
    phone,
    hrEmail,
    companyEmail,
    ip: ctx.ip,
    deviceId: ctx.deviceId,
  })
  const risk = scoreSignup(signals)
  if (risk.decision === 'DECLINE') return { status: 'DECLINED' as SignupStatus }

  const hashedPassword = await bcrypt.hash(password, 10)
  const code = generateSignupCode()
  console.log(`[TEMP-OTP] email=${companyEmail} code=${code}`) // TEMP: remove before merge

  const { company, signupId } = await prisma.$transaction(async (tx) => {
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
        // Locked until both checks pass; the trial clock has not started.
        trialStatus: 'HELD',
        trialLimitsProfile: limitsProfileFor(signals),
      },
    })

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
    })
    await tx.userCompany.create({
      data: { userId: staff.id, companyId: company.id, role: 'HR', createdBy: 'SELF_SIGNUP' },
    })

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
    })
    await tx.signupVerification.update({
      where: { id: verification.id },
      data: { emailCodeHash: hashSignupCode(verification.id, 'email', code) },
    })

    await tx.trialSignal.createMany({
      data: signalRows(company.id, {
        EMAIL_DOMAIN: isFreeMailDomain(emailDomain(hrEmail)) ? null : emailDomain(hrEmail),
        PHONE: phone,
        RC_NUMBER: rc || null,
        TAX_ID: taxId || null,
        DEVICE: ctx.deviceId,
        IP: ctx.ip,
        COMPANY_NAME: normalizeCompanyName(companyName) || null,
      }),
    })

    return { company, signupId: verification.id }
  })

  // Best-effort seeding, same as the admin register flow; never blocks sign-up.
  try { await prisma.aISettings.create({ data: { companyId: company.id, enabled: true, monthlyBudget: 100.0, costPerReview: 0.02, costAlertThreshold: 80, defaultService: 'openai', defaultModel: 'gpt-3.5-turbo', autoShortlistThreshold: 75, useForSeniorRoles: true, useForTechnicalRoles: true, useForManagerRoles: true, updatedBy: 'SELF_SIGNUP' } }) } catch (e) { console.warn('[signup] AI settings seed failed:', e) }
  try { await seedModuleAccessForCompany(company.id, TRIAL_MODULE_KEYS) } catch (e) { console.warn('[signup] module access seed failed:', e) }
  try { await seedDefaultPayslipPreset(company.id, 'SELF_SIGNUP') } catch (e) { console.warn('[signup] payslip preset seed failed:', e) }

  const sent = await sendEmailCode(hrEmail, firstName, code)
  if (!sent) console.error('[signup] verification email failed for', signupId)

  // A held sign-up looks identical to the person; they only learn the outcome after verifying.
  return { status: 'VERIFY_EMAIL' as SignupStatus, signupId }
}

// ── verify-email ─────────────────────────────────────────────────────────────

async function loadVerification(signupId: unknown) {
  const id = s(signupId)
  if (!id) throw new SignupError(BAD_CODE, 400)
  const v = await prisma.signupVerification.findUnique({ where: { id } })
  if (!v) throw new SignupError(BAD_CODE, 400)
  return v
}

export async function verifyEmail(signupId: unknown, code: unknown) {
  const v = await loadVerification(signupId)
  const wait = checkVerifyLimit(v.id)
  if (wait > 0) throw new SignupError('Too many attempts. Please try again later.', 429, { retryAfter: wait })

  if (v.emailVerifiedAt) return nextAfterEmail(v)

  const supplied = s(code)
  if (!v.emailCodeHash || !v.emailCodeExpiresAt || v.emailCodeExpiresAt < new Date() || v.emailAttempts >= MAX_CODE_ATTEMPTS) {
    throw new SignupError('This code has expired. Please request a new one.', 400)
  }
  if (!/^\d{6}$/.test(supplied) || !codesMatch(v.emailCodeHash, v.id, 'email', supplied)) {
    await prisma.signupVerification.update({ where: { id: v.id }, data: { emailAttempts: { increment: 1 } } })
    throw new SignupError(BAD_CODE, 400)
  }

  const now = new Date()
  const phoneCode = generateSignupCode()
  console.log(`[TEMP-OTP] phone=${v.phone} code=${phoneCode}`) // TEMP: remove before merge
  await prisma.$transaction([
    prisma.signupVerification.update({
      where: { id: v.id },
      data: {
        emailVerifiedAt: now,
        emailCodeHash: null,
        emailAttempts: 0,
        phoneCodeHash: hashSignupCode(v.id, 'phone', phoneCode),
        phoneCodeExpiresAt: expiry(),
        phoneAttempts: 0,
      },
    }),
    prisma.company.update({ where: { id: v.companyId }, data: { emailVerifiedAt: now } }),
    prisma.staffRecord.update({ where: { id: v.userId }, data: { isActive: true } }),
  ])

  const sent = await sendSmsCode(v.phone, phoneCode)
  if (!sent) throw new SignupError('We could not send the text message. Please try resending the code.', 502, { status: 'VERIFY_PHONE' })
  return { status: 'VERIFY_PHONE' as SignupStatus }
}

function nextAfterEmail(v: { phoneVerifiedAt: Date | null; riskDecision: string }) {
  return { status: (v.phoneVerifiedAt ? 'TRIAL_STARTED' : 'VERIFY_PHONE') as SignupStatus }
}

// ── verify-phone ─────────────────────────────────────────────────────────────

export async function verifyPhone(signupId: unknown, code: unknown) {
  const v = await loadVerification(signupId)
  if (!v.emailVerifiedAt) throw new SignupError(BAD_CODE, 400)
  const wait = checkVerifyLimit(v.id)
  if (wait > 0) throw new SignupError('Too many attempts. Please try again later.', 429, { retryAfter: wait })

  if (v.phoneVerifiedAt) return phoneOutcome(v.companyId, v.riskDecision)

  const supplied = s(code)
  if (!v.phoneCodeHash || !v.phoneCodeExpiresAt || v.phoneCodeExpiresAt < new Date() || v.phoneAttempts >= MAX_CODE_ATTEMPTS) {
    throw new SignupError('This code has expired. Please request a new one.', 400)
  }
  if (!/^\d{6}$/.test(supplied) || !codesMatch(v.phoneCodeHash, v.id, 'phone', supplied)) {
    await prisma.signupVerification.update({ where: { id: v.id }, data: { phoneAttempts: { increment: 1 } } })
    throw new SignupError(BAD_CODE, 400)
  }

  const now = new Date()
  const hold = v.riskDecision === 'HOLD'
  const trialEndsAt = new Date(now.getTime() + TRIAL_LENGTH_DAYS * DAY_MS)

  await prisma.$transaction([
    prisma.signupVerification.update({
      where: { id: v.id },
      data: { phoneVerifiedAt: now, phoneCodeHash: null, phoneAttempts: 0 },
    }),
    prisma.company.update({
      where: { id: v.companyId },
      data: hold
        ? { phoneVerifiedAt: now }
        : { phoneVerifiedAt: now, trialStatus: 'TRIAL', trialStartsAt: now, trialEndsAt },
    }),
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
  ])

  if (hold) await notifySuperAdmins(v.companyId, v.riskScore)
  return hold ? { status: 'HELD' as SignupStatus } : { status: 'TRIAL_STARTED' as SignupStatus, trialEndsAt: trialEndsAt.toISOString() }
}

async function phoneOutcome(companyId: string, decision: string) {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { trialStatus: true, trialEndsAt: true } })
  if (decision === 'HOLD' && c?.trialStatus === 'HELD') return { status: 'HELD' as SignupStatus }
  return { status: 'TRIAL_STARTED' as SignupStatus, trialEndsAt: c?.trialEndsAt?.toISOString() }
}

async function notifySuperAdmins(companyId: string, score: number) {
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } })
    const admins = await prisma.staffRecord.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, companyId: true },
    })
    await Promise.all(
      admins.map((a) =>
        createNotification(
          a.id,
          'TRIAL_REVIEW',
          'Trial awaiting review',
          `${company?.companyName ?? 'A new company'} was held for review (risk score ${score}).`,
          { trialCompanyId: companyId, score },
          a.companyId,
        ),
      ),
    )
  } catch (e) {
    console.warn('[signup] could not notify super admins:', e)
  }
}

// ── resend ───────────────────────────────────────────────────────────────────

export async function resendCode(signupId: unknown, channel: unknown) {
  if (channel !== 'email' && channel !== 'phone') throw new SignupError('Unknown channel.', 400)
  const v = await loadVerification(signupId)
  const wait = checkResendLimit(v.id, channel)
  if (wait > 0) throw new SignupError('Please wait before requesting another code.', 429, { retryAfter: wait })

  const code = generateSignupCode()
  console.log(`[TEMP-OTP] channel=${channel} to=${channel === 'email' ? v.email : v.phone} code=${code}`) // TEMP: remove before merge
  if (channel === 'email') {
    if (v.emailVerifiedAt) throw new SignupError('Email already verified.', 400)
    await prisma.signupVerification.update({
      where: { id: v.id },
      data: { emailCodeHash: hashSignupCode(v.id, 'email', code), emailCodeExpiresAt: expiry(), emailAttempts: 0 },
    })
    const staff = await prisma.staffRecord.findUnique({ where: { id: v.userId }, select: { firstName: true } })
    if (!(await sendEmailCode(v.email, staff?.firstName ?? 'there', code))) {
      throw new SignupError('We could not send the email. Please try again shortly.', 502)
    }
  } else {
    if (!v.emailVerifiedAt) throw new SignupError('Verify your email first.', 400)
    if (v.phoneVerifiedAt) throw new SignupError('Phone already verified.', 400)
    await prisma.signupVerification.update({
      where: { id: v.id },
      data: { phoneCodeHash: hashSignupCode(v.id, 'phone', code), phoneCodeExpiresAt: expiry(), phoneAttempts: 0 },
    })
    if (!(await sendSmsCode(v.phone, code))) {
      throw new SignupError('We could not send the text message. Please try again shortly.', 502)
    }
  }
  return { sent: true }
}
