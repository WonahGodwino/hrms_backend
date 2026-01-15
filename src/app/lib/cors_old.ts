// src/app/lib/cors.ts
import { NextRequest, NextResponse } from "next/server";

const PROD_FRONTEND = "https://app.isurfglobal.com";

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  PROD_FRONTEND,
  process.env.NEXT_PUBLIC_FRONTEND_URL || "",
].filter(Boolean);

function resolveOrigin(origin: string | null): string | undefined {
  // If no Origin header (server-to-server / curl), don’t force CORS.
  if (!origin) return undefined;

  // Exact match only (required when credentials=true)
  if (allowedOrigins.includes(origin)) return origin;

  return undefined;
}

export function getCorsHeaders(origin: string | null) {
  const resolvedOrigin = resolveOrigin(origin);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    // Helps proxies/CDNs cache per-origin correctly
    Vary: "Origin",
  };

  if (resolvedOrigin) {
    headers["Access-Control-Allow-Origin"] = resolvedOrigin;
  }

  return headers;
}

export function withCors(res: NextResponse, origin: string | null) {
  const headers = getCorsHeaders(origin);
  Object.entries(headers).forEach(([key, value]) => {
    res.headers.set(key, value);
  });
  return res;
}

export function handleCorsOptions(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = getCorsHeaders(origin);

  // If origin is not allowed, return 204 without Allow-Origin (browser will block)
  return new NextResponse(null, { status: 204, headers });
}

/**
 * Convenience helper for route handlers:
 * - If OPTIONS request => returns preflight response
 * - Otherwise returns null so you can continue normal handling
 */
export function maybeHandleCors(req: NextRequest) {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  return null;
}
