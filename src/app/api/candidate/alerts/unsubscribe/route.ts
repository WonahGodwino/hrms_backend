import { unsubscribeByToken } from "@/app/lib/candidate-portal/alerts";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const page = (title: string, body: string) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;text-align:center"><h2>${title}</h2>${body}</body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
const token = (r: NextRequest) =>
  new URL(r.url).searchParams.get("token") ?? "";

export async function GET(request: NextRequest) {
  return page(
    "Turn off job alerts?",
    `<p>You will stop receiving job alert emails. Your saved preferences are kept.</p><form method="post" action="?token=${encodeURIComponent(token(request))}"><button style="padding:12px 24px;font-size:16px">Turn off alerts</button></form>`,
  );
}
export async function POST(request: NextRequest) {
  return (await unsubscribeByToken(token(request)))
    ? page(
        "Job alerts are off",
        "<p>You will no longer receive job alert emails. You can turn them back on from Saved Jobs &amp; Alerts.</p>",
      )
    : page("Link not valid", "<p>This unsubscribe link is invalid.</p>");
}
