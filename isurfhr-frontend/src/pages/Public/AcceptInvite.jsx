// src/pages/Public/AcceptInvite.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";

import { parseTokenFromSearch, parseTokenFromUrl } from "@/lib/inviteLink";
import { validateToken, acceptInvitation } from "@/services/InvitationService";

/**
 * AcceptInvite page
 *
 * Route: /accept-invite?token=...
 *
 * Behavior:
 * - If token missing/invalid/expired -> show friendly message
 * - If valid -> show form to set name + password -> call acceptInvitation({ token, name, password })
 * - On accept success -> toast + redirect to /login
 */
export default function AcceptInvite() {
  const navigate = useNavigate();
  const location = useLocation();

  // helper: extract token and optional id from a location object (search/hash/path)
  const getInviteParamsFromLocation = (loc) => {
    // prefer location.search; fall back to window.href to handle backend path-style links
    const searchOrHref =
      (loc && (loc.search || `${loc.pathname}${loc.hash || ""}`)) ??
      (typeof window !== "undefined" ? window.location.href : "");

    const token =
      parseTokenFromSearch(searchOrHref, "token") ||
      parseTokenFromUrl(searchOrHref, "token") ||
      null;

    const id =
      parseTokenFromSearch(searchOrHref, "id") ||
      parseTokenFromUrl(searchOrHref, "id") ||
      null;

    return { token, id };
  };

  const initialParams = getInviteParamsFromLocation(location);

  // token is derived from location and updates when the URL changes
  const [token, setToken] = useState(() => initialParams.token);
  const [externalCompanyId, setExternalCompanyId] = useState(
    () => initialParams.id
  );

  const [loading, setLoading] = useState(Boolean(initialParams.token));
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // form
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // keep token state in sync with the URL (reactive behavior)
  useEffect(() => {
    const { token: t, id } = getInviteParamsFromLocation(location);
    setToken(t);
    setExternalCompanyId(id);
  }, [location]);

  useEffect(() => {
    // if token changes or present on mount, validate it
    const t = token;
    if (!t) {
      setInviteInfo(null);
      setLoadError("No invite token provided in the URL.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setInviteInfo(null); // clear any previous invite info while validating new token

    (async () => {
      try {
        const res = await validateToken(t);
        const data = (res && res.data) ?? res;
        if (cancelled) return;

        // Merge external companyId (if provided in the link) into inviteInfo for display,
        // preferring backend-provided fields when present.
        const merged =
          data && typeof data === "object"
            ? {
                ...data,
                companyId:
                  data.companyId ??
                  data.company_id ??
                  externalCompanyId ??
                  null,
              }
            : {
                companyId: externalCompanyId ?? null,
                email: data?.email ?? null,
              };

        setInviteInfo(merged);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // keep previous console.error for debugging
        console.error("Token validation failed", err);
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Invalid or expired invite token.";
        setLoadError(message);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // include externalCompanyId so that if it changes we update the merged inviteInfo on re-validate
  }, [token, externalCompanyId]);

  const expiryDisplay = useMemo(() => {
    if (!inviteInfo) return null;
    const expiresAt =
      inviteInfo.expiresAt ??
      inviteInfo.expires_at ??
      inviteInfo.expires ??
      null;
    if (!expiresAt) return "No expiry set";
    try {
      return format(new Date(expiresAt), "PPP p");
    } catch {
      return String(expiresAt);
    }
  }, [inviteInfo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !name.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!token) {
      toast.error("Missing invite token.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        token,
        name: name.trim(),
        password,
      };
      await acceptInvitation(payload);
      toast.success("Account created. You can now log in.");
      navigate("/login");
    } catch (err) {
      console.error("Accept invite failed", err);
      toast.error(
        err?.response?.data?.message || "Failed to accept invitation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // render
  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <Card>
        <CardContent>
          <h2 className="text-xl font-semibold mb-2">Accept Invitation</h2>

          {loading ? (
            <p className="text-sm text-muted-foreground">
              Validating invite...
            </p>
          ) : loadError ? (
            <div className="space-y-3">
              <p className="text-sm text-red-600">
                Unable to validate invite: {loadError}
              </p>
              <p className="text-sm">
                If you believe this is an error, contact your administrator or
                request a new invite.
              </p>
            </div>
          ) : inviteInfo ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm">
                  <strong>Company:</strong>{" "}
                  {(inviteInfo.companyName ??
                    inviteInfo.company?.name ??
                    inviteInfo.company ??
                    inviteInfo.companyId) ||
                    "—"}
                </p>
                <p className="text-sm">
                  <strong>Invited email:</strong>{" "}
                  {inviteInfo.email ?? inviteInfo.invitedEmail ?? "—"}
                </p>
                <p className="text-sm">
                  <strong>Expires:</strong> {expiryDisplay}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <Label>Full name</Label>
                  <Input
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    placeholder="Choose a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    At least 8 characters.
                  </p>
                </div>

                <div>
                  <Label>Confirm password</Label>
                  <Input
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => navigate("/login")}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create account"}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No invitation data available.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
