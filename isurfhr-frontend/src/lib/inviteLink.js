// src/utils/inviteLink.js
/**
 * Helpers for building and parsing invite links.
 *
 * Usage:
 *   import { makeInviteLink, parseTokenFromSearch, parseTokenFromUrl, getTokenFromLocation } from '@/utils/inviteLink';
 *
 * Note: set VITE_APP_URL (or VITE_PUBLIC_APP_URL) in your .env for stable links in non-browser contexts.
 */

const getDefaultBaseUrl = () => {
  if (import.meta.env.VITE_PUBLIC_APP_URL)
    return import.meta.env.VITE_PUBLIC_APP_URL;
  if (import.meta.env.VITE_APP_URL) return import.meta.env.VITE_APP_URL;
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.origin
  )
    return window.location.origin;
  return "";
};

const ensureNoTrailingSlash = (s) => (s ? s.replace(/\/+$/, "") : s);
const ensureLeadingSlash = (s) => (s ? (s.startsWith("/") ? s : `/${s}`) : "/");

export function makeInviteLink(token, options = {}) {
  if (!token) throw new Error("makeInviteLink: token is required");

  const baseRaw = options.baseUrl ?? getDefaultBaseUrl();
  const base = ensureNoTrailingSlash(baseRaw);
  const path = ensureLeadingSlash(options.path ?? "/accept-invite");
  const qName = options.queryName ?? "token";

  const prefix = base ? base : "";
  return `${prefix}${path}?${encodeURIComponent(qName)}=${encodeURIComponent(
    token
  )}`;
}

export function parseTokenFromSearch(search, queryName = "token") {
  let raw = search;

  if (!raw) {
    if (typeof window !== "undefined") {
      raw = window.location.search || window.location.href || "";
    } else {
      return null;
    }
  }

  if (raw.includes("?")) {
    try {
      const qs = raw.startsWith("?") ? raw : raw.slice(raw.indexOf("?"));
      const params = new URLSearchParams(qs);
      const val = params.get(queryName);
      if (val) return val;
    } catch (err) {
      console.debug("parseTokenFromSearch error:", err);
    }
  }

  try {
    const regex = new RegExp(`${queryName}=([^&/#?]+)`, "i");
    const m = regex.exec(raw);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch (err) {
    console.debug("parseTokenFromSearch regex error:", err);
  }

  return null;
}

export function parseTokenFromUrl(urlString, queryName = "token") {
  if (!urlString) return null;

  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const url = new URL(urlString, base);
    const q = url.searchParams.get(queryName);
    if (q) return q;
    if (url.hash && url.hash.includes(queryName + "=")) {
      const hashMatch = new RegExp(`${queryName}=([^&/#?]+)`, "i").exec(
        url.hash
      );
      if (hashMatch && hashMatch[1]) return decodeURIComponent(hashMatch[1]);
    }
  } catch (err) {
    console.debug("parseTokenFromUrl parse error:", err);
  }

  try {
    const regex = new RegExp(`${queryName}=([^&/#?]+)`, "i");
    const m = regex.exec(urlString);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch (err) {
    console.debug("parseTokenFromUrl regex error:", err);
  }

  return null;
}

export function getTokenFromLocation(queryName = "token") {
  if (typeof window === "undefined") return null;
  return parseTokenFromSearch(
    window.location.search || window.location.href,
    queryName
  );
}

export default {
  makeInviteLink,
  parseTokenFromSearch,
  parseTokenFromUrl,
  getTokenFromLocation,
};
