// src/services/InvitationService.js
import API from "./axios";

/** Simple mapping for common status variants -> normalized status */
const STATUS_NORMALIZATION = {
  pending: "pending",
  sent: "pending",
  created: "pending",
  waiting: "pending",

  accepted: "accepted",
  used: "accepted",
  completed: "accepted",

  expired: "expired",
  exp: "expired",

  revoked: "revoked",
  cancelled: "revoked",
  canceled: "revoked",
  revoked_by_admin: "revoked",
};

const normalizeStatusValue = (raw) => {
  if (raw == null) return "unknown";
  const s = String(raw).trim().toLowerCase();
  return STATUS_NORMALIZATION[s] ?? s ?? "unknown";
};

const normalizeInvitation = (raw = {}) => {
  if (!raw || typeof raw !== "object") return raw;

  const token =
    raw.token ??
    raw.tokenString ??
    raw.token_value ??
    raw.token_id ??
    raw.id ??
    null;

  const companyId = raw.companyId ?? raw.company_id ?? raw.company?.id ?? null;
  const expiresAt = raw.expiresAt ?? raw.expires_at ?? raw.expires ?? null;

  const rawStatus =
    raw.status ?? raw.state ?? raw.invite_status ?? raw.status_type ?? null;

  return {
    ...raw,
    token,
    companyId,
    expiresAt,
    status: normalizeStatusValue(rawStatus),
  };
};

const normalizeListResponse = (data) => {
  if (!data) return data;
  if (Array.isArray(data)) return data.map(normalizeInvitation);

  if (Array.isArray(data.invitations))
    return { ...data, invitations: data.invitations.map(normalizeInvitation) };
  if (Array.isArray(data.items))
    return { ...data, items: data.items.map(normalizeInvitation) };
  if (Array.isArray(data.results))
    return { ...data, results: data.results.map(normalizeInvitation) };
  if (Array.isArray(data.rows))
    return { ...data, rows: data.rows.map(normalizeInvitation) };
  if (data.data && Array.isArray(data.data.items))
    return {
      ...data,
      data: { ...data.data, items: data.data.items.map(normalizeInvitation) },
    };

  if (typeof data === "object" && (data.id || data.token || data.email))
    return normalizeInvitation(data);

  return data;
};

export const getInvitations = async (params = {}) => {
  const res = await API.get("/core/invitations", { params });
  const data = res.data ?? res;
  return normalizeListResponse(data);
};

export const getInvitation = async (id) => {
  const res = await API.get(`/core/invitations/${id}`);
  const data = res.data ?? res;
  return normalizeInvitation(data);
};

/**
 * createInvitation:
 * - calls the actual backend endpoint POST /company/invite
 * - handles backend returning a raw link string or an object; always returns a predictable object
 */
export const createInvitation = async (payload) => {
  // backend expects { companyId, email } per API spec you provided
  const res = await API.post("/company/invite", payload);
  const data = res.data ?? res;

  // backend returns a string link (e.g., "https://...") -> wrap it
  if (typeof data === "string") {
    return {
      link: data,
      email: payload?.email ?? null,
      companyId: payload?.companyId ?? payload?.company_id ?? null,
      status: "pending",
    };
  }

  // backend returns object -> normalize and preserve link if present
  if (data && typeof data === "object") {
    const link = data.link ?? data.url ?? null;
    const normalized = normalizeInvitation(data);
    if (link) normalized.link = link;
    return normalized;
  }

  return data;
};

export const resendInvitation = (id) =>
  API.post(`/core/invitations/${id}/resend`);

export const validateToken = (token) =>
  API.get("/core/invitations/validate", { params: { token } });

export const acceptInvitation = (payload) =>
  API.post("/core/invitations/accept", payload);

export const revokeInvitation = (id) => API.delete(`/core/invitations/${id}`);

export default {
  getInvitations,
  getInvitation,
  createInvitation,
  resendInvitation,
  validateToken,
  acceptInvitation,
  revokeInvitation,
};
