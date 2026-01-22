// lib/mailgun.ts
import fetch from "node-fetch";

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const response = await fetch(`https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      text,
    }),
  });

  const data = await response.json();
  if (data.message === "Queued. Thank you.") {
    return { success: true };
  }
  return { success: false, message: data.message };
}
