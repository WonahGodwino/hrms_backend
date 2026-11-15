// Super_Admin review of held self sign-up trials (document sections 6.3, 7 and 8):
// list the queue, show the signals and linked trials, and record a decision. Every
// decision is stored on the TrialReview row and written to the audit ledger.
import { prisma } from '@/app/lib/db'
import { logAuditEvent } from '@/app/lib/audit/audit-utils'
import { sendEmail } from '@/app/lib/email'
import { createNotification } from '@/app/lib/notifications/helpers'

import { MAX_EXTENSION_DAYS, TRIAL_LENGTH_DAYS } from './limits'
import { verifyRc } from './signup/cac'

const DAY_MS = 24 * 60 * 60 * 1000

export const REVIEW_ACTIONS = ['approve', 'decline', 'extend', 'ban', 'recheck-rc'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]

export class ReviewError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ReviewError'
    this.status = status
  }
}

const COMPANY_SELECT = {
  id: true,
  companyName: true,
  rcNumber: true,
  taxId: true,
  email: true,
  phone: true,
  industry: true,
  trialStatus: true,
  trialStartsAt: true,
  trialEndsAt: true,
  trialExtraDays: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const

export async function listReviews(opts: { status?: string; page: number; pageSize: number }) {
  const where = opts.status ? { status: opts.status } : {}
  const [total, rows] = await Promise.all([
    prisma.trialReview.count({ where }),
    prisma.trialReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { company: { select: COMPANY_SELECT } },
    }),
  ])
  return { total, rows }
}

// Other trials that share a signal with this one. Two or more shared kinds is treated as one
// cluster (document section 6.2, "link accounts into clusters").
export async function linkedTrials(companyId: string) {
  const mine = await prisma.trialSignal.findMany({ where: { companyId }, select: { kind: true, valueHash: true } })
  if (!mine.length) return []
  const others = await prisma.trialSignal.findMany({
    where: { companyId: { not: companyId }, OR: mine.map((m) => ({ kind: m.kind, valueHash: m.valueHash })) },
    select: { companyId: true, kind: true },
  })
  const byCompany = new Map<string, Set<string>>()
  for (const o of others) {
    if (!byCompany.has(o.companyId)) byCompany.set(o.companyId, new Set())
    byCompany.get(o.companyId)!.add(o.kind)
  }
  if (!byCompany.size) return []
  const companies = await prisma.company.findMany({
    where: { id: { in: [...byCompany.keys()] } },
    select: { id: true, companyName: true, trialStatus: true, createdAt: true },
  })
  return companies
    .map((c) => {
      const kinds = [...(byCompany.get(c.id) ?? [])]
      return { ...c, sharedSignals: kinds, sameCluster: kinds.length >= 2 }
    })
    .sort((a, b) => b.sharedSignals.length - a.sharedSignals.length)
}

export async function getReviewDetail(id: string) {
  const review = await prisma.trialReview.findUnique({ where: { id }, include: { company: { select: COMPANY_SELECT } } })
  if (!review) throw new ReviewError('Trial review not found.', 404)
  const [hr, linked, history] = await Promise.all([
    prisma.staffRecord.findFirst({
      where: { companyId: review.companyId, role: 'HR' },
      select: { firstName: true, lastName: true, email: true, phone: true, isActive: true },
    }),
    linkedTrials(review.companyId),
    prisma.trialReview.findMany({
      where: { companyId: review.companyId, id: { not: id } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, decision: true, note: true, reviewedAt: true },
    }),
  ])
  return { review, hr, linked, history }
}

interface Actor {
  userId: string
  name?: string
}

async function notifyHr(companyId: string, subject: string, text: string) {
  try {
    const hr = await prisma.staffRecord.findFirst({ where: { companyId, role: 'HR' }, select: { email: true, firstName: true } })
    if (hr?.email) await sendEmail({ to: hr.email, subject, text: `Hi ${hr.firstName ?? ''},\n\n${text}\n\n247HR`, html: `<p>Hi ${hr.firstName ?? ''},</p><p>${text}</p><p>247HR</p>` })
  } catch (e) {
    console.warn('[trial-review] could not email HR contact:', e)
  }
}

// ── Extension requests (document section 5: "extension on request") ─────────

export const DEFAULT_EXTENSION_DAYS = 7

async function notifySuperAdmins(companyId: string, title: string, message: string) {
  try {
    const admins = await prisma.staffRecord.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true, companyId: true } })
    await Promise.all(admins.map((a) => createNotification(a.id, 'TRIAL_REVIEW', title, message, { trialCompanyId: companyId }, a.companyId)))
  } catch (e) {
    console.warn('[trial-review] could not notify super admins:', e)
  }
}

// HR asks the team for more time. One open request at a time, and none once the
// maximum extension has been given.
export async function requestExtension(companyId: string, reason: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { companyName: true, trialStatus: true, trialExtraDays: true },
  })
  if (!company || (company.trialStatus !== 'TRIAL' && company.trialStatus !== 'READ_ONLY')) {
    throw new ReviewError('An extension can only be requested during or just after your trial.')
  }
  if ((company.trialExtraDays || 0) >= MAX_EXTENSION_DAYS) throw new ReviewError('This trial has already been extended as far as it can be.', 409)
  const open = await prisma.trialReview.findFirst({ where: { companyId, kind: 'EXTENSION', status: 'PENDING' }, select: { id: true } })
  if (open) throw new ReviewError('Your extension request is already with our team.', 409)

  const text = reason.trim().slice(0, 500) || 'No reason given'
  await prisma.trialReview.create({ data: { companyId, kind: 'EXTENSION', score: 0, reasons: [`Extension requested: ${text}`] as any } })
  await notifySuperAdmins(companyId, 'Trial extension requested', `${company.companyName} asked for more trial time.`)
}

// ── Behaviour flags (document section 6.2 "watch behaviour", section 7) ──────
// A flagged trial is quietly moved to the tight limits profile and queued for review.

export async function raiseBehaviourFlag(companyId: string, flag: string) {
  const existing = await prisma.trialReview.findFirst({ where: { companyId, kind: 'BEHAVIOUR', status: 'PENDING' }, select: { id: true, reasons: true } })
  if (existing) {
    const reasons = Array.isArray(existing.reasons) ? (existing.reasons as unknown[]) : []
    if (reasons.includes(flag)) return
    await prisma.trialReview.update({ where: { id: existing.id }, data: { reasons: [...reasons, flag] as any, score: { increment: 30 } } })
    return
  }
  const company = await prisma.company.update({ where: { id: companyId }, data: { trialLimitsProfile: 'tight' }, select: { companyName: true } })
  await prisma.trialReview.create({ data: { companyId, kind: 'BEHAVIOUR', score: 30, reasons: [flag] as any } })
  await notifySuperAdmins(companyId, 'Trial flagged for review', `${company.companyName}: ${flag}`)
}

export async function decideReview(
  id: string,
  action: ReviewAction,
  input: { note?: string; days?: number },
  actor: Actor,
) {
  const review = await prisma.trialReview.findUnique({ where: { id }, include: { company: { select: COMPANY_SELECT } } })
  if (!review) throw new ReviewError('Trial review not found.', 404)
  const company = review.company
  const note = (input.note ?? '').trim() || null
  const now = new Date()
  const closed = review.status !== 'PENDING'

  const audit = (act: string, risk: string, before: string, after: string) =>
    logAuditEvent({
      companyId: company.id,
      action: `Trial review: ${act}`,
      entityType: 'TrialReview',
      entityId: id,
      actorId: actor.userId,
      risk,
      beforeValue: before,
      afterValue: after,
      reason: note,
    })

  // Extension requests: approve adds days (default 7), decline closes the request. The trial
  // itself is never declined by this.
  if (review.kind === 'EXTENSION') {
    if (closed) throw new ReviewError('This request has already been decided.', 409)
    if (action === 'approve') {
      const days = input.days === undefined ? DEFAULT_EXTENSION_DAYS : Math.floor(Number(input.days))
      if (!Number.isFinite(days) || days < 1 || days > MAX_EXTENSION_DAYS) throw new ReviewError(`Extension must be between 1 and ${MAX_EXTENSION_DAYS} days.`)
      const total = Math.min(MAX_EXTENSION_DAYS, (company.trialExtraDays || 0) + days)
      await prisma.$transaction([
        prisma.company.update({ where: { id: company.id }, data: { trialExtraDays: total } }),
        prisma.trialReview.update({ where: { id }, data: { status: 'APPROVED', decision: 'EXTEND', note, reviewedBy: actor.userId, reviewedAt: now } }),
      ])
      await audit('extension approved', 'MEDIUM', `${company.trialExtraDays || 0} extra days`, `${total} extra days`)
      await notifyHr(company.id, 'Your 247HR trial has been extended', `Your trial now runs ${total} extra day${total === 1 ? '' : 's'}.`)
      return { trialExtraDays: total }
    }
    if (action === 'decline') {
      await prisma.trialReview.update({ where: { id }, data: { status: 'DECLINED', decision: 'DECLINE', note, reviewedBy: actor.userId, reviewedAt: now } })
      await audit('extension declined', 'LOW', '', 'declined')
      await notifyHr(company.id, 'About your 247HR trial extension', 'We are not able to extend your trial this time. You can subscribe at any time and keep everything you have set up.')
      return {}
    }
    throw new ReviewError('Approve or decline an extension request.')
  }

  // Behaviour flags: approve clears the flag and restores the standard limits; decline keeps the
  // restriction. Ban locks the company like any other.
  if (review.kind === 'BEHAVIOUR' && action !== 'ban' && action !== 'recheck-rc' && action !== 'extend') {
    if (closed) throw new ReviewError('This flag has already been decided.', 409)
    const clear = action === 'approve'
    await prisma.$transaction([
      ...(clear ? [prisma.company.update({ where: { id: company.id }, data: { trialLimitsProfile: 'standard' } })] : []),
      prisma.trialReview.update({
        where: { id },
        data: { status: clear ? 'APPROVED' : 'DECLINED', decision: clear ? 'CLEAR' : 'KEEP_RESTRICTED', note, reviewedBy: actor.userId, reviewedAt: now },
      }),
    ])
    await audit(clear ? 'behaviour flag cleared' : 'restriction kept', clear ? 'LOW' : 'MEDIUM', 'tight', clear ? 'standard' : 'tight')
    return { trialLimitsProfile: clear ? 'standard' : 'tight' }
  }

  if (action === 'recheck-rc') {
    if (!company.rcNumber) throw new ReviewError('This company has no registration number on file.')
    const verdict = await verifyRc(company.rcNumber, company.companyName)
    const line =
      verdict.verdict === 'verified'
        ? `CAC re-check: verified as ${verdict.registeredName} (${verdict.status})`
        : verdict.verdict === 'self_declared'
          ? 'CAC re-check: format checks only (no CAC provider configured)'
          : verdict.verdict === 'unavailable'
            ? `CAC re-check: lookup unavailable (${verdict.reason})`
            : `CAC re-check: rejected (${verdict.reason})`
    const reasons = Array.isArray(review.reasons) ? (review.reasons as unknown[]) : []
    await prisma.trialReview.update({ where: { id }, data: { reasons: [...reasons, line] as any } })
    await audit('RC re-check', 'LOW', '', line)
    return { verdict }
  }

  if (action === 'extend') {
    if (company.trialStatus === 'HELD' || company.trialStatus === 'DECLINED') {
      throw new ReviewError('Approve the trial before extending it.')
    }
    const days = Math.floor(Number(input.days))
    if (!Number.isFinite(days) || days < 1 || days > MAX_EXTENSION_DAYS) {
      throw new ReviewError(`Extension must be between 1 and ${MAX_EXTENSION_DAYS} days.`)
    }
    const total = Math.min(MAX_EXTENSION_DAYS, (company.trialExtraDays || 0) + days)
    await prisma.company.update({ where: { id: company.id }, data: { trialExtraDays: total } })
    await prisma.trialReview.update({
      where: { id },
      data: { decision: 'EXTEND', note: note ?? review.note, reviewedBy: actor.userId, reviewedAt: now },
    })
    await audit('extended', 'MEDIUM', `${company.trialExtraDays || 0} extra days`, `${total} extra days`)
    await notifyHr(company.id, 'Your 247HR trial has been extended', `Your trial now runs ${total} extra day${total === 1 ? '' : 's'}.`)
    return { trialExtraDays: total }
  }

  if (closed && action !== 'ban') throw new ReviewError('This review has already been decided.', 409)

  if (action === 'approve') {
    if (!company.emailVerifiedAt) throw new ReviewError('The HR contact has not verified their email yet.', 409)
    const trialEndsAt = new Date(now.getTime() + TRIAL_LENGTH_DAYS * DAY_MS)
    await prisma.$transaction([
      prisma.company.update({
        where: { id: company.id },
        data: { trialStatus: 'TRIAL', trialStartsAt: company.trialStartsAt ?? now, trialEndsAt },
      }),
      prisma.staffRecord.updateMany({ where: { companyId: company.id, role: 'HR' }, data: { isActive: true } }),
      prisma.trialReview.update({
        where: { id },
        data: { status: 'APPROVED', decision: 'APPROVE', note, reviewedBy: actor.userId, reviewedAt: now },
      }),
    ])
    await audit('approved', 'MEDIUM', company.trialStatus, 'TRIAL')
    await notifyHr(company.id, 'Your 247HR trial is ready', `We have verified your company. Your ${TRIAL_LENGTH_DAYS}-day trial has started, so you can sign in now.`)
    return { trialStatus: 'TRIAL', trialEndsAt }
  }

  // decline / ban: lock the company and its users. Nothing is deleted.
  const isBan = action === 'ban'
  await prisma.$transaction([
    prisma.company.update({ where: { id: company.id }, data: { trialStatus: 'DECLINED' } }),
    prisma.staffRecord.updateMany({ where: { companyId: company.id }, data: { isActive: false } }),
    prisma.trialReview.update({
      where: { id },
      data: { status: isBan ? 'BANNED' : 'DECLINED', decision: isBan ? 'BAN' : 'DECLINE', note, reviewedBy: actor.userId, reviewedAt: now },
    }),
  ])
  await audit(isBan ? 'banned' : 'declined', 'HIGH', company.trialStatus, 'DECLINED')
  if (!isBan) await notifyHr(company.id, 'About your 247HR trial request', 'We could not verify your company. Please contact us if you think this is a mistake.')
  return { trialStatus: 'DECLINED' }
}
