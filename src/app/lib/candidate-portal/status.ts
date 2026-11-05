import { prisma } from "@/app/lib/db";
import {
  Authed,
  CODE_TTL_MS,
  EMAIL_RE,
  allow,
  httpErr,
  issueOtp,
  limiters,
  maskEmail,
  otpFail,
  readGrant,
  signGrant,
  verifyOtpCode,
} from "@/app/lib/candidate-portal/core";
import { mail, statusCodeMail } from "@/app/lib/candidate-portal/emails";
import {
  APP_DETAIL_SELECT,
  appDetailDto,
  notArchived,
} from "@/app/lib/candidate-portal/views";
import { linkByEmail } from "@/app/lib/candidate-portal/auth";

// The emailed code always goes to the address on file. Typing a reference code never reveals it.
async function resolveLookup(
  body: any,
): Promise<{ email: string | null; focusRef: string | null }> {
  const ref = String(body.referenceCode ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  const typed = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!ref && (!EMAIL_RE.test(typed) || typed.length > 254))
    throw httpErr(
      400,
      "Enter your email address or your application reference code",
    );
  if (!ref) return { email: typed, focusRef: null };
  if (ref.length !== 10) return { email: null, focusRef: ref };
  const a = await prisma.jobApplication.findUnique({
    where: { referenceCode: ref },
    select: { candidate: { select: { email: true } } },
  });
  return { email: a?.candidate.email.toLowerCase() ?? null, focusRef: ref };
}

export async function requestStatusCode(body: any, ip: string) {
  const generic = { sent: true };
  if (!(await allow(limiters.minute, 10, `cp-status:ip:${ip}`)))
    throw httpErr(429, "Too many requests. Please try again in a minute.");
  const { email } = await resolveLookup(body);
  if (!email) return generic;
  if (!(await allow(limiters.window, 3, `cp-status:${email}`))) return generic;
  const has = await prisma.jobApplication.count({
    where: { candidate: { email: { equals: email, mode: "insensitive" } } },
  });
  if (!has) return generic;
  const r = await issueOtp({
    purpose: "STATUS_LOOKUP",
    email,
    ttlMs: CODE_TTL_MS,
  });
  if (!("cooldown" in r)) await mail(email, statusCodeMail(r.secret));
  return generic;
}

export async function verifyStatus(body: any, ip: string) {
  if (!(await allow(limiters.minute, 20, `cp-status-verify:ip:${ip}`)))
    throw httpErr(429, "Too many attempts. Please try again in a minute.");
  const code = String(body.code ?? "").trim();
  if (!/^\d{6}$/.test(code))
    throw httpErr(400, "Enter the 6-digit code from your email");
  const { email, focusRef } = await resolveLookup(body);
  if (!email) throw httpErr(400, "Invalid or expired code.");
  const r = await verifyOtpCode("STATUS_LOOKUP", email, code);
  if (r !== "ok") throw httpErr(400, otpFail(r));

  const rows = await prisma.jobApplication.findMany({
    where: {
      candidate: { email: { equals: email, mode: "insensitive" } },
      ...notArchived,
    },
    select: APP_DETAIL_SELECT,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const applications = rows.map((a) => ({
    ...appDetailDto(a),
    isFocus: focusRef ? a.referenceCode === focusRef : false,
  }));
  return {
    applications,
    maskedEmail: maskEmail(email),
    grant: signGrant(email),
    focusRef,
  };
}

export async function linkLookup(account: Authed, body: any) {
  const email = readGrant(String(body.grant ?? ""));
  if (!email)
    throw httpErr(
      400,
      "This verification has expired. Look up your application again.",
    );
  const r = await linkByEmail(account.id, email);
  if (r.linked === 0 && r.alreadyLinked === 0 && r.conflicts > 0)
    throw httpErr(
      409,
      "These applications are already linked to another account.",
    );
  return r;
}
