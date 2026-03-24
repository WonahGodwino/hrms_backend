// src/components/admin/InviteEmailPreview.jsx
import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { makeInviteLink } from "@/lib/inviteLink";

/**
 * InviteEmailPreview
 *
 * Props:
 *  - invitation: either a string (raw invite link) OR an object:
 *      { link?, token?, tokenString?, id?, email?, expiresAt?, expires_at?, expires_in?, expiresInDays? }
 *  - company: { id, name } (optional, used in body)
 *  - baseUrl: optional string to build the invite link (overrides env/window origin)
 *  - onCopy?: callback when copy is done (optional)
 *
 * Behavior:
 *  - If invitation is a string, treat it as the full invite link.
 *  - Else if invitation.link exists, use that.
 *  - Else try to build a link from token/id via makeInviteLink.
 */
const InviteEmailPreview = ({
  invitation = {},
  company = {},
  baseUrl,
  onCopy,
}) => {
  const isStringInvitation =
    typeof invitation === "string" && invitation.length > 0;

  // applicant email
  const applicantEmail = isStringInvitation ? "" : invitation.email ?? "";

  // expiry fields (only meaningful for object invitations)
  const expiresAt = isStringInvitation
    ? null
    : invitation.expiresAt ?? invitation.expires_at ?? null;
  const expiresInDays = isStringInvitation
    ? null
    : invitation.expiresInDays ??
      invitation.expires_in ??
      invitation.expires ??
      null;

  // token fallback (only when invitation is an object and no explicit link provided)
  const token = isStringInvitation
    ? null
    : invitation.link
    ? null
    : invitation.token ?? invitation.tokenString ?? invitation.id ?? "";

  // Determine the inviteLink to display/copy:
  // 1) if invitation is a raw string -> use it
  // 2) else if invitation.link exists -> use it
  // 3) else if token exists -> build via makeInviteLink
  const inviteLink = useMemo(() => {
    try {
      if (isStringInvitation) return invitation;
      if (invitation && typeof invitation === "object" && invitation.link)
        return invitation.link;
      if (!token) return "";
      const linkOptions = {
        baseUrl: baseUrl ?? undefined,
        path: "/applicant-register",
        queryName: "token",
      };
      return makeInviteLink(token, linkOptions);
    } catch {
      return "";
    }
  }, [invitation, isStringInvitation, token, baseUrl]);

  const formattedExpiry = useMemo(() => {
    if (expiresAt) {
      try {
        return format(new Date(expiresAt), "PPP p");
      } catch {
        return String(expiresAt);
      }
    }
    if (expiresInDays) {
      const days = Number(expiresInDays);
      if (!Number.isNaN(days)) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        try {
          return `${days} day(s) — expires on ${format(d, "PPP")}`;
        } catch {
          return `${days} day(s)`;
        }
      }
    }
    return "No expiry set";
  }, [expiresAt, expiresInDays]);

  const emailSubject = `Invitation to join ${company?.name ?? "our platform"}`;

  // Build email body using the full inviteLink (if available); fallback to a generic message.
  const emailBody = useMemo(() => {
    const linkPart = inviteLink || "[invite link]";
    return [
      `Hello,`,
      ``,
      `You have been invited to join ${
        company?.name ?? "our organization"
      } on our HR portal.`,
      ``,
      `Please follow the link below to accept the invitation and complete your sign up:`,
      `${linkPart}`,
      ``,
      `This invitation ${
        expiresAt || expiresInDays
          ? `expires on: ${formattedExpiry}`
          : "has no expiry set"
      }.`,
      ``,
      `If you did not expect this invite, please ignore this email.`,
      ``,
      `Thanks,`,
      `${company?.name ?? "The Team"}`,
    ].join("\n");
  }, [company, inviteLink, expiresAt, expiresInDays, formattedExpiry]);

  const handleCopyLink = async () => {
    try {
      if (!inviteLink) throw new Error("No invite link to copy");
      await navigator.clipboard.writeText(inviteLink);
      if (typeof window !== "undefined" && window.__TOAST__?.success) {
        window.__TOAST__.success("Invite link copied");
      }
      onCopy && onCopy(inviteLink);
    } catch (err) {
      console.error("Copy failed", err);
      if (typeof window !== "undefined" && window.__TOAST__?.error) {
        window.__TOAST__.error("Failed to copy invite link");
      }
    }
  };

  const handleOpenMail = () => {
    try {
      if (!inviteLink) return;
      // If we have a full link, compose the mailto manually so we don't require a token.
      const recipients = applicantEmail || "";
      const params = new URLSearchParams();
      params.set("subject", emailSubject);
      params.set("body", emailBody);
      const mailto = `mailto:${encodeURIComponent(
        recipients
      )}?${params.toString()}`;
      if (typeof window !== "undefined") window.location.href = mailto;
    } catch (err) {
      console.error("Failed to open mail client", err);
    }
  };

  return (
    <Card className="w-full">
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">Email preview</h3>
              <p className="text-sm text-muted-foreground">
                Review the invitation email that will be sent to the invited
                user.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyLink}
                disabled={!inviteLink}
              >
                Copy Link
              </Button>
              <Button size="sm" onClick={handleOpenMail} disabled={!inviteLink}>
                Open Mail Client
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div>
              <Label className="text-sm">To</Label>
              <Input value={applicantEmail || "(not specified)"} readOnly />
            </div>

            <div>
              <Label className="text-sm">Subject</Label>
              <Input value={emailSubject} readOnly />
            </div>

            <div>
              <Label className="text-sm">Invite link</Label>
              <Input value={inviteLink || "(no link)"} readOnly />
            </div>

            <div>
              <Label className="text-sm">Expiry</Label>
              <Input value={formattedExpiry} readOnly />
            </div>

            <div>
              <Label className="text-sm">Message preview</Label>
              <pre className="whitespace-pre-wrap bg-muted p-3 rounded text-sm">
                {emailBody}
              </pre>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default InviteEmailPreview;
