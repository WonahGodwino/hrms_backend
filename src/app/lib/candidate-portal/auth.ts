import { prisma } from "@/app/lib/db";
import { hashPassword, comparePassword } from "@/app/lib/auth";
import {
  Authed,
  CpHttp,
  accountDto,
  allow,
  cleanEmail,
  CODE_TTL_MS,
  findResetToken,
  FRONTEND_URL,
  httpErr,
  isUnique,
  issueOtp,
  limiters,
  LOCK_AFTER,
  LOCK_MS,
  otpFail,
  REMEMBER_TTL_S,
  RESET_TTL_MS,
  SESSION_TTL_S,
  signCandidateToken,
  text,
  verifyOtpCode,
} from "@/app/lib/candidate-portal/core";
import {
  mail,
  resetMail,
  verifyEmailMail,
} from "@/app/lib/candidate-portal/emails";

function checkPassword(v: unknown) {
  const p = String(v ?? "");
  if (p.length < 8)
    throw httpErr(400, "Password must be at least 8 characters long");
  if (p.length > 72)
    throw httpErr(400, "Password must be at most 72 characters long");
  return p;
}
function sessionFor(acc: any, remember: boolean) {
  const ttl = remember ? REMEMBER_TTL_S : SESSION_TTL_S;
  return {
    token: signCandidateToken(acc.id, acc.tokenVersion, ttl),
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    account: accountDto(acc),
  };
}

// Attaches every per-company Candidate row with this email to the account.
export async function linkByEmail(accountId: string, email: string) {
  const rows = await prisma.candidate.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, accountId: true },
  });
  const free = rows.filter((r) => !r.accountId).map((r) => r.id);
  const mine = rows.filter((r) => r.accountId === accountId).length;
  const conflicts = rows.length - free.length - mine;
  const linked = free.length
    ? (
        await prisma.candidate.updateMany({
          where: { id: { in: free }, accountId: null },
          data: { accountId },
        })
      ).count
    : 0;
  return { linked, alreadyLinked: mine, conflicts };
}

export async function sendVerificationCode(acc: {
  id: string;
  email: string;
  firstName: string;
}) {
  const r = await issueOtp({
    purpose: "EMAIL_VERIFY",
    email: acc.email,
    accountId: acc.id,
    ttlMs: CODE_TTL_MS,
  });
  if ("cooldown" in r) return { sent: false, cooldown: true };
  await mail(acc.email, verifyEmailMail(acc.firstName, r.secret));
  return { sent: true, cooldown: false };
}

export async function registerAccount(body: any, ip: string) {
  if (!(await allow(limiters.window, 10, `cp-register:${ip}`)))
    throw httpErr(429, "Too many attempts. Please try again later.");
  const firstName = text(body.firstName, "First name", {
    required: true,
    max: 80,
  })!;
  const lastName = text(body.lastName, "Last name", {
    required: true,
    max: 80,
  })!;
  const email = cleanEmail(body.email);
  const passwordHash = await hashPassword(checkPassword(body.password));
  let acc;
  try {
    acc = await prisma.candidateAccount.create({
      data: { email, passwordHash, firstName, lastName },
    });
  } catch (e) {
    if (isUnique(e))
      throw httpErr(
        409,
        "An account with this email already exists. Sign in instead.",
      );
    throw e;
  }
  await sendVerificationCode(acc);
  return { ...sessionFor(acc, false), verificationRequired: true };
}

let dummyHash: Promise<string> | null = null;
export async function loginAccount(body: any, ip: string) {
  if (!(await allow(limiters.window, 30, `cp-login:${ip}`)))
    throw httpErr(429, "Too many attempts. Please try again later.");
  const email = cleanEmail(body.email);
  const password = String(body.password ?? "");
  if (!password) throw httpErr(400, "Email and password are required");
  const acc = await prisma.candidateAccount.findUnique({ where: { email } });
  if (!acc) {
    dummyHash ??= hashPassword("not-a-real-password"); // keeps timing similar for unknown emails
    await comparePassword(password, await dummyHash);
    throw httpErr(401, "Invalid email or password");
  }
  if (!acc.isActive) throw httpErr(403, "This account has been deactivated");
  if (acc.lockedUntil && acc.lockedUntil > new Date()) {
    const mins = Math.ceil((+acc.lockedUntil - Date.now()) / 60000);
    throw httpErr(
      429,
      `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    );
  }
  if (!(await comparePassword(password, acc.passwordHash))) {
    const failed = acc.failedLoginCount + 1;
    await prisma.candidateAccount.update({
      where: { id: acc.id },
      data:
        failed >= LOCK_AFTER
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
          : { failedLoginCount: failed },
    });
    throw httpErr(401, "Invalid email or password");
  }
  const fresh = await prisma.candidateAccount.update({
    where: { id: acc.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return sessionFor(fresh, body.remember === true);
}

export async function getMe(account: Authed) {
  const a = await prisma.candidateAccount.findUniqueOrThrow({
    where: { id: account.id },
  });
  return accountDto(a);
}

export async function verifyEmail(account: Authed, body: any) {
  if (account.emailVerifiedAt) return { verified: true, linked: 0 };
  const code = String(body.code ?? "").trim();
  if (!/^\d{6}$/.test(code))
    throw httpErr(400, "Enter the 6-digit code from your email");
  if (!(await allow(limiters.minute, 10, `cp-verify:${account.id}`)))
    throw httpErr(429, "Too many attempts. Please wait a minute.");
  const r = await verifyOtpCode("EMAIL_VERIFY", account.email, code);
  if (r !== "ok") throw httpErr(400, otpFail(r));
  await prisma.candidateAccount.update({
    where: { id: account.id },
    data: { emailVerifiedAt: new Date() },
  });
  const link = await linkByEmail(account.id, account.email);
  return { verified: true, linked: link.linked };
}

export async function resendVerification(account: Authed) {
  if (account.emailVerifiedAt) return { alreadyVerified: true };
  const r = await sendVerificationCode(account);
  if (r.cooldown)
    throw httpErr(429, "Please wait a minute before requesting another code");
  return { sent: true };
}

export async function forgotPassword(body: any, ip: string) {
  const generic = { sent: true };
  if (!(await allow(limiters.window, 15, `cp-forgot:ip:${ip}`)))
    throw httpErr(429, "Too many requests. Please try again later.");
  const email = cleanEmail(body.email);
  if (!(await allow(limiters.window, 3, `cp-forgot:${email}`))) return generic;
  const acc = await prisma.candidateAccount.findUnique({ where: { email } });
  if (!acc || !acc.isActive) return generic;
  const r = await issueOtp({
    purpose: "PASSWORD_RESET",
    email,
    accountId: acc.id,
    token: true,
    ttlMs: RESET_TTL_MS,
  });
  if (!("cooldown" in r))
    await mail(
      email,
      resetMail(
        acc.firstName,
        `${FRONTEND_URL}/candidate-reset-password?token=${r.secret}`,
      ),
    );
  return generic;
}

export async function resetPassword(body: any, ip: string) {
  if (!(await allow(limiters.window, 20, `cp-reset:${ip}`)))
    throw httpErr(429, "Too many attempts. Please try again later.");
  const token = String(body.token ?? "");
  const password = checkPassword(body.newPassword);
  if (password !== String(body.confirmPassword ?? ""))
    throw httpErr(400, "Passwords do not match");
  const row = token.length === 64 ? await findResetToken(token) : null;
  if (!row || !row.accountId)
    throw httpErr(400, "This reset link is invalid or has expired.");
  const passwordHash = await hashPassword(password);
  try {
    await prisma.$transaction(async (tx) => {
      const used = await tx.candidateOtp.updateMany({
        where: { id: row.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!used.count)
        throw httpErr(400, "This reset link is invalid or has expired.");
      const acc = await tx.candidateAccount.findUnique({
        where: { id: row.accountId! },
        select: { emailVerifiedAt: true },
      });
      await tx.candidateAccount.update({
        where: { id: row.accountId! },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          failedLoginCount: 0,
          lockedUntil: null,
          // receiving the reset email proves the mailbox is theirs
          ...(acc && !acc.emailVerifiedAt
            ? { emailVerifiedAt: new Date() }
            : {}),
        },
      });
    });
  } catch (e) {
    if (e instanceof CpHttp) throw e;
    throw e;
  }
  await linkByEmail(row.accountId, row.email);
  return { reset: true };
}
