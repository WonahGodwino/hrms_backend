import { NextRequest } from "next/server";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/db";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import rateLimit from "@/app/lib/rateLimiter";

export const MAX_SUPPORTING_DOCS = 3;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const LOCK_AFTER = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const SESSION_TTL_S = 24 * 3600;
export const REMEMBER_TTL_S = 30 * 24 * 3600;
export const GRANT_TTL_S = 30 * 60;
export const FRONTEND_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL || "https://247hr.co.uk";
export const BACKEND_URL =
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_APP_URL || "";

// ---------------------------------------------------------------- errors / results
export class CpHttp extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const httpErr = (status: number, message: string) =>
  new CpHttp(status, message);
export class CpResult {
  constructor(
    public data: any,
    public message = "Success",
    public status = 200,
  ) {}
}
export type Params<T> = { params: Promise<T> | T };
export const isUnique = (e: any, field?: string) =>
  e?.code === "P2002" &&
  (!field || String(e?.meta?.target ?? "").includes(field));

// ---------------------------------------------------------------- rate limiting (in-memory, per process)
export const limiters = {
  window: rateLimit({
    interval: 15 * 60 * 1000,
    uniqueTokenPerInterval: 20000,
  }),
  minute: rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 10000 }),
};
// `max` calls are allowed per interval. The limiter itself rejects at count >= limit, hence max + 1.
export async function allow(
  l: ReturnType<typeof rateLimit>,
  max: number,
  key: string,
) {
  try {
    await l.check(max + 1, key);
    return true;
  } catch {
    return false;
  }
}
export const clientIp = (r: NextRequest) =>
  r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  r.headers.get("x-real-ip") ||
  "unknown";

// ---------------------------------------------------------------- tokens (separate secret, so staff and candidate tokens never cross)
function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET environment variable is not set");
  return crypto
    .createHmac("sha256", s)
    .update("candidate-portal:v1")
    .digest("hex");
}
export function signCandidateToken(
  accountId: string,
  tokenVersion: number,
  ttlSeconds: number,
) {
  return (jwt as any).sign(
    { typ: "candidate", sub: accountId, tv: tokenVersion },
    secret(),
    {
      expiresIn: ttlSeconds,
    },
  ) as string;
}
export function readCandidateToken(
  token: string,
): { sub: string; tv: number } | null {
  try {
    const d = jwt.verify(token, secret(), { algorithms: ["HS256"] }) as any;
    if (d?.typ !== "candidate" || !d.sub) return null;
    return { sub: String(d.sub), tv: Number(d.tv) };
  } catch {
    return null;
  }
}
// Proof that the holder passed a STATUS_LOOKUP code for this email (used by "Link to my account").
export function signGrant(email: string) {
  return (jwt as any).sign({ typ: "status-grant", email }, secret(), {
    expiresIn: GRANT_TTL_S,
  }) as string;
}
export function readGrant(token: string): string | null {
  try {
    const d = jwt.verify(token, secret(), { algorithms: ["HS256"] }) as any;
    return d?.typ === "status-grant" && d.email
      ? String(d.email).toLowerCase()
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- one-time codes and reset tokens (hashed, in the database)
type OtpPurpose = "EMAIL_VERIFY" | "PASSWORD_RESET" | "STATUS_LOOKUP";
const hashSecret = (v: string) =>
  crypto
    .createHmac(
      "sha256",
      process.env.OTP_PEPPER || process.env.JWT_SECRET || "",
    )
    .update(v)
    .digest("hex");

export async function issueOtp(p: {
  purpose: OtpPurpose;
  email: string;
  accountId?: string | null;
  scopeRef?: string | null;
  token?: boolean;
  ttlMs: number;
}): Promise<{ secret: string } | { cooldown: true }> {
  const recent = await prisma.candidateOtp.findFirst({
    where: {
      purpose: p.purpose,
      email: p.email,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) return { cooldown: true };
  const value = p.token
    ? crypto.randomBytes(32).toString("hex")
    : crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await prisma.$transaction([
    prisma.candidateOtp.updateMany({
      where: { purpose: p.purpose, email: p.email, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.candidateOtp.create({
      data: {
        purpose: p.purpose,
        email: p.email,
        accountId: p.accountId ?? null,
        scopeRef: p.scopeRef ?? null,
        codeHash: hashSecret(value),
        expiresAt: new Date(Date.now() + p.ttlMs),
      },
    }),
  ]);
  void prisma.candidateOtp
    .deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    })
    .catch(() => {});
  return { secret: value };
}

export type OtpResult = "ok" | "invalid" | "expired" | "locked";
export async function verifyOtpCode(
  purpose: OtpPurpose,
  email: string,
  code: string,
): Promise<OtpResult> {
  const row = await prisma.candidateOtp.findFirst({
    where: { purpose, email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return "invalid";
  if (row.expiresAt <= new Date()) return "expired";
  if (row.attempts >= MAX_OTP_ATTEMPTS) return "locked";
  const bump = await prisma.candidateOtp.updateMany({
    where: { id: row.id, attempts: { lt: MAX_OTP_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (!bump.count) return "locked";
  const a = Buffer.from(hashSecret(code), "hex");
  const b = Buffer.from(row.codeHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "invalid";
  const used = await prisma.candidateOtp.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return used.count ? "ok" : "invalid";
}
export const otpFail = (r: OtpResult) =>
  r === "expired"
    ? "This code has expired. Request a new one."
    : r === "locked"
      ? "Too many attempts. Request a new code."
      : "Invalid or expired code.";

export async function findResetToken(token: string) {
  const row = await prisma.candidateOtp.findFirst({
    where: {
      purpose: "PASSWORD_RESET",
      codeHash: hashSecret(token),
      consumedAt: null,
    },
  });
  return row && row.expiresAt > new Date() ? row : null;
}

// ---------------------------------------------------------------- validation
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function cleanEmail(v: unknown) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(s) || s.length > 254)
    throw httpErr(400, "A valid email address is required");
  return s;
}
export function text(
  v: unknown,
  field: string,
  o: { required?: boolean; max?: number } = {},
): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (o.required) throw httpErr(400, `${field} is required`);
    return null;
  }
  const max = o.max ?? 500;
  if (s.length > max)
    throw httpErr(400, `${field} must be at most ${max} characters`);
  return s;
}
export function webUrl(v: unknown, field: string): string | null {
  const s = text(v, field, { max: 300 });
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return s;
  } catch {
    throw httpErr(400, `${field} must be a valid web address (https://...)`);
  }
}
export function parseYmd(
  v: unknown,
  field: string,
  required = false,
): Date | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw httpErr(400, `${field} is required`);
    return null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m![2] - 1)
    throw httpErr(400, `${field} must be a valid date (YYYY-MM-DD)`);
  return d;
}
export const ymd = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;
export function paging(sp: URLSearchParams, dflt = 10) {
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, parseInt(sp.get("pageSize") ?? String(dflt), 10) || dflt),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}
export const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
};

// ---------------------------------------------------------------- account shape
export type Authed = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: Date | null;
};
export const initialsOf = (a: { firstName: string; lastName: string }) =>
  `${a.firstName?.[0] ?? ""}${a.lastName?.[0] ?? ""}`.toUpperCase() || "C";
export const accountDto = (a: any) => ({
  id: a.id,
  email: a.email,
  firstName: a.firstName,
  lastName: a.lastName,
  initials: initialsOf(a),
  phone: a.phone ?? null,
  headline: a.headline ?? null,
  locationState: a.locationState ?? null,
  locationLga: a.locationLga ?? null,
  linkedInUrl: a.linkedInUrl ?? null,
  portfolioUrl: a.portfolioUrl ?? null,
  emailVerified: Boolean(a.emailVerifiedAt),
});

// ---------------------------------------------------------------- route wrapper
export type CpCtx = {
  request: NextRequest;
  account: Authed | null;
  body: any;
  ip: string;
};

export async function cpRoute(
  request: NextRequest,
  opts: { auth?: boolean; json?: boolean },
  fn: (c: CpCtx) => Promise<any>,
) {
  const origin = request.headers.get("origin");
  const done = async (res: any) => {
    const r: any = await withCors(res, origin);
    r.headers.set("Cache-Control", "no-store"); // personal data: never cached
    return r;
  };
  try {
    let account: Authed | null = null;
    if (opts.auth) {
      const m = /^Bearer\s+(.+)$/i.exec(
        (request.headers.get("authorization") || "").trim(),
      );
      const claims = m ? readCandidateToken(m[1]) : null;
      if (!claims) throw httpErr(401, "Please sign in to continue");
      const row = await prisma.candidateAccount.findUnique({
        where: { id: claims.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          emailVerifiedAt: true,
          isActive: true,
          tokenVersion: true,
        },
      });
      if (!row || !row.isActive || row.tokenVersion !== claims.tv)
        throw httpErr(401, "Your session has expired. Please sign in again");
      account = row;
    }
    const body = opts.json
      ? ((await request.json().catch(() => ({}))) ?? {})
      : {};
    const out = await fn({ request, account, body, ip: clientIp(request) });
    if (out instanceof Response) return done(out);
    if (out instanceof CpResult)
      return done(ApiResponse.success(out.data, out.message, out.status));
    return done(ApiResponse.success(out, "Success"));
  } catch (e) {
    if (e instanceof CpHttp)
      return done(ApiResponse.error(e.message, e.status));
    return done(handleApiError(e));
  }
}
