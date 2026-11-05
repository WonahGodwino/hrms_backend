import { sendEmail } from "@/app/lib/email";
import { FRONTEND_URL } from "@/app/lib/candidate-portal/core";

const esc = (s: any) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const layout = (
  title: string,
  inner: string,
) => `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f4;font-family:Arial,sans-serif;color:#333;line-height:1.6">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">
<h2 style="margin:0 0 16px;color:#2c5530">${esc(title)}</h2>${inner}
<p style="margin-top:28px;font-size:12px;color:#777">This is an automated message. Please do not reply.</p></div></body></html>`;

const btn = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#2c5530;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;
const code = (c: string) =>
  `<p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:14px 0">${esc(c)}</p>`;

export type Mail = { subject: string; html: string; text: string };

export const verifyEmailMail = (name: string, c: string): Mail => ({
  subject: "Verify your email address",
  html: layout(
    "Verify your email",
    `<p>Hi ${esc(name)},</p><p>Enter this code to verify your email address:</p>${code(c)}<p>It expires in 10 minutes.</p>`,
  ),
  text: `Hi ${name}, your verification code is ${c}. It expires in 10 minutes.`,
});
export const resetMail = (name: string, link: string): Mail => ({
  subject: "Reset your password",
  html: layout(
    "Reset your password",
    `<p>Hi ${esc(name)},</p><p>Use the button below to choose a new password. The link works once and expires in 60 minutes.</p>${btn(link, "Reset password")}<p style="font-size:12px;color:#777">If you did not ask for this, you can ignore this email.</p>`,
  ),
  text: `Hi ${name}, reset your password here (valid for 60 minutes): ${link}`,
});
export const statusCodeMail = (c: string): Mail => ({
  subject: "Your application status code",
  html: layout(
    "Application status code",
    `<p>Use this code to view your application status:</p>${code(c)}<p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`,
  ),
  text: `Your application status code is ${c}. It expires in 10 minutes.`,
});
export const receivedMail = (
  name: string,
  job: string,
  company: string,
  ref: string,
): Mail => ({
  subject: `Application received: ${job}`,
  html: layout(
    "Application received",
    `<p>Hi ${esc(name)},</p><p>We received your application for <strong>${esc(job)}</strong> at ${esc(company)}.</p><p>Your reference code: <strong>${esc(ref)}</strong></p>${btn(`${FRONTEND_URL}/candidate-applications`, "Track your application")}`,
  ),
  text: `Hi ${name}, we received your application for ${job} at ${company}. Reference: ${ref}.`,
});
export const withdrawnMail = (
  name: string,
  job: string,
  company: string,
): Mail => ({
  subject: `You withdrew your application: ${job}`,
  html: layout(
    "Application withdrawn",
    `<p>Hi ${esc(name)},</p><p>Your application for <strong>${esc(job)}</strong> at ${esc(company)} has been withdrawn.</p><p>This does not affect other roles. You stay in our talent pool and can apply to any open vacancy.</p>${btn(`${FRONTEND_URL}/careers/jobs-board`, "Browse open roles")}`,
  ),
  text: `Hi ${name}, your application for ${job} at ${company} has been withdrawn. You can still apply to other roles.`,
});
export const alertMail = (
  name: string,
  jobs: { id: string; title: string; company: string; meta: string }[],
  more: number,
  unsubscribeUrl: string,
): Mail => ({
  subject: `${jobs.length + more} new job${jobs.length + more === 1 ? "" : "s"} matching your alerts`,
  html: layout(
    "New jobs for you",
    `<p>Hi ${esc(name)}, these roles match your job alert preferences:</p>` +
      jobs
        .map(
          (j) =>
            `<div style="border:1px solid #e5e5e5;border-radius:6px;padding:12px;margin:10px 0"><strong>${esc(j.title)}</strong><br>${esc(j.company)}${j.meta ? ` &middot; ${esc(j.meta)}` : ""}<br><a href="${esc(`${FRONTEND_URL}/careers/jobs-board/${j.id}`)}">View role</a></div>`,
        )
        .join("") +
      (more > 0 ? `<p>and ${more} more.</p>` : "") +
      btn(`${FRONTEND_URL}/careers/jobs-board`, "Browse all jobs") +
      `<p style="font-size:12px;color:#777"><a href="${esc(unsubscribeUrl)}">Turn off job alerts</a></p>`,
  ),
  text:
    `Hi ${name}, new jobs matching your alerts:\n` +
    jobs
      .map(
        (j) =>
          `- ${j.title} (${j.company}): ${FRONTEND_URL}/careers/jobs-board/${j.id}`,
      )
      .join("\n") +
    (more ? `\nand ${more} more.` : "") +
    `\n\nTurn off alerts: ${unsubscribeUrl}`,
});

export async function mail(to: string, m: Mail) {
  try {
    const r = await sendEmail({
      to,
      subject: m.subject,
      html: m.html,
      text: m.text,
    });
    if (!r.success) console.error("[candidate-portal] email failed:", r.error);
    return r.success;
  } catch (e: any) {
    console.error("[candidate-portal] email error:", e?.message);
    return false;
  }
}
