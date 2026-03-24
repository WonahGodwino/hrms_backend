import React from "react";
import { Button } from "@/components/ui/button";

/**
 * InvitationRowActions
 *
 * Props:
 *  - id: string (invitation id)
 *  - invitation: object (optional)
 *  - onResend(id)
 *  - onRevoke(id)
 *  - onView(id) optional
 */
const InvitationRowActions = ({
  id,
  invitation,
  onResend = () => {},
  onRevoke = () => {},
  onView,
}) => {
  // Use invitation prop for status/title/data attributes to avoid unused var lint error
  const invStatus =
    invitation?.status ??
    invitation?.state ??
    invitation?.statusType ??
    (invitation && (invitation.expiresAt || invitation.expires_at)
      ? "pending"
      : undefined) ??
    undefined;

  // Treat temporary/optimistic items (e.g. id = "temp-12345") as placeholders - actions should be disabled
  const safeId = typeof id === "string" ? id : String(id ?? "");
  const isPlaceholder =
    !safeId || safeId.startsWith("temp-") || invitation?.isTemp === true;

  const handleRevoke = () => {
    // prevent revoke of placeholder entries (no server id)
    if (isPlaceholder) return;
    if (!confirm("Revoke this invitation? This cannot be undone.")) return;
    onRevoke(id);
  };

  const handleResend = () => {
    if (isPlaceholder) return;
    onResend(id);
  };

  return (
    <div
      className="flex gap-2"
      // expose invitation status for tests/automation
      data-invitation-status={invStatus ?? "unknown"}
      data-invitation-id={safeId}
    >
      <Button
        size="sm"
        variant="outline"
        onClick={handleResend}
        title={
          isPlaceholder
            ? "Cannot resend until invitation is saved on the server"
            : `Resend invitation${invStatus ? ` — status: ${invStatus}` : ""}`
        }
        disabled={isPlaceholder}
        aria-disabled={isPlaceholder}
      >
        Resend
      </Button>

      <Button
        size="sm"
        variant="destructive"
        onClick={handleRevoke}
        title={
          isPlaceholder
            ? "Cannot revoke until invitation is saved on the server"
            : `Revoke invitation${invStatus ? ` — status: ${invStatus}` : ""}`
        }
        disabled={isPlaceholder}
        aria-disabled={isPlaceholder}
      >
        Revoke
      </Button>

      {onView && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            // guard view against placeholders as well — callers may still choose to handle it
            if (isPlaceholder) return;
            onView(id);
          }}
          title={
            isPlaceholder
              ? "Cannot view details until invitation is saved on the server"
              : `View invitation${invStatus ? ` — status: ${invStatus}` : ""}`
          }
          disabled={isPlaceholder}
          aria-disabled={isPlaceholder}
        >
          View
        </Button>
      )}
    </div>
  );
};

export default InvitationRowActions;
