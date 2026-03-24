// src/components/admin/InvitationFormModal.jsx
import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";

import { createInvitation } from "@/services/InvitationService";
import InviteEmailPreview from "./InviteEmailPreview";
import InviteStatusBadge from "@/components/InviteStatusBadge";
import { useAuth } from "@/lib/context/AuthContext";

/**
 * InvitationFormModal
 * - When the logged-in user is NOT a superuser, the companyId will be
 *   defaulted to the user's company and the company selector is hidden.
 *
 * Props:
 *  - isOpen
 *  - setIsOpen
 *  - companyOptions = [] (used for superuser select)
 *  - onCreated(invitation)
 *  - initialEmail
 */
const InvitationFormModal = ({
  isOpen,
  setIsOpen,
  companyOptions = [],
  onCreated = () => {},
  initialEmail = "",
}) => {
  const { user } = useAuth() || {};
  const role = (user?.role || "").toString().toLowerCase();
  const isSuperuser = role === "superuser";

  // derive user's company id from multiple possible shapes
  const authCompanyId =
    user?.companyId ??
    user?.company_id ??
    (user?.company && (user.company.id ?? user.company._id)) ??
    null;

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    // companyId may be set from authCompanyId when non-superuser
    companyId: "",
    email: "",
    expiresAt: "",
    message: "",
  });

  const [createdInvitation, setCreatedInvitation] = useState(null);

  // Reset/prefill on open/close
  useEffect(() => {
    if (!isOpen) {
      setForm({ companyId: "", email: "", expiresAt: "", message: "" });
      setSubmitting(false);
      setCreatedInvitation(null);
    } else {
      // when opening, prefill recipient email if provided
      if (initialEmail) {
        setForm((p) => ({ ...p, email: initialEmail }));
      }
      // if user is not superuser and has an authCompanyId, enforce it
      if (!isSuperuser && authCompanyId) {
        setForm((p) => ({ ...p, companyId: String(authCompanyId) }));
      }
    }
  }, [isOpen, initialEmail, isSuperuser, authCompanyId]);

  const handleChange = (e) => {
    const { name, value } = e.target || {};
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSelect = (name, value) =>
    setForm((p) => ({ ...p, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.email.trim()) {
      toast.error("Recipient email is required");
      return;
    }

    // if user isn't superuser, prefer authCompanyId
    const companyIdFinal =
      (form.companyId && String(form.companyId)) ||
      (!isSuperuser && authCompanyId ? String(authCompanyId) : "");

    if (!companyIdFinal) {
      toast.error("Please choose a company");
      return;
    }

    setSubmitting(true);
    try {
      // Only send required fields per backend expectations
      const payload = {
        companyId: String(companyIdFinal),
        email: form.email.trim(),
      };

      const res = await createInvitation(payload);
      // backend may return the invite link or an object; keep it flexible
      const link = res?.data ?? res ?? null;

      if (!link) {
        throw new Error("No invite link returned");
      }

      // Build a minimal invitation object for previewing
      const invitation = {
        link,
        companyId: payload.companyId,
        email: payload.email,
        status: "pending",
      };

      toast.success("Invitation created");
      setCreatedInvitation(invitation);
      onCreated(invitation);
    } catch (err) {
      console.error("Invitation create failed", err);
      toast.error(
        err?.response?.data?.message || "Failed to create invitation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleCreateAnother = () => {
    setCreatedInvitation(null);
    setForm((p) => ({
      ...p,
      email: initialEmail ?? "",
      expiresAt: "",
      message: "",
      // keep companyId for convenience (especially for non-superuser)
      companyId: !isSuperuser && authCompanyId ? String(authCompanyId) : "",
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <div className="flex justify-between items-center">
          <DialogTitle className="text-lg font-semibold">
            {createdInvitation ? "Invitation created" : "Create Invitation"}
          </DialogTitle>
        </div>

        {createdInvitation ? (
          <>
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <InviteStatusBadge
                    status={createdInvitation.status ?? "pending"}
                    size="sm"
                  />
                </div>
              </div>

              <InviteEmailPreview
                invitation={createdInvitation}
                company={
                  companyOptions.find(
                    (c) => String(c.id) === String(createdInvitation.companyId)
                  ) || {}
                }
                onCopy={() => {
                  if (
                    typeof window !== "undefined" &&
                    window.__TOAST__?.success
                  ) {
                    window.__TOAST__.success("Invite link copied");
                  } else {
                    toast.success("Invite link copied");
                  }
                }}
              />
            </div>

            <div className="flex gap-2 pt-4 justify-end">
              <Button
                variant="outline"
                type="button"
                onClick={handleCreateAnother}
              >
                Create another
              </Button>
              <Button type="button" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <form className="space-y-4 pt-4" onSubmit={handleSubmit}>
            {/* If superuser => show company select; otherwise hidden input (prefilled) */}
            {isSuperuser ? (
              <div className="space-y-2">
                <Label>Company</Label>
                <Select
                  value={form.companyId}
                  onValueChange={(v) => handleSelect("companyId", v)}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companyOptions.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // keep a hidden input for form semantics and show a read-only hint
              <>
                <input
                  type="hidden"
                  name="companyId"
                  value={
                    form.companyId ||
                    (authCompanyId ? String(authCompanyId) : "") ||
                    ""
                  }
                />
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    value={
                      // try to display company name if available in companyOptions
                      companyOptions.find(
                        (c) =>
                          String(c.id) ===
                          (form.companyId ||
                            (authCompanyId && String(authCompanyId)))
                      )?.name ??
                      // fallback to raw id or placeholder
                      (form.companyId ||
                        (authCompanyId && String(authCompanyId)) ||
                        "—")
                    }
                    readOnly
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Recipient Email</Label>
              <Input
                name="email"
                value={form.email}
                onChange={handleChange}
                type="email"
                placeholder="email@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Expiry (optional)</Label>
              <Input
                name="expiresAt"
                value={form.expiresAt}
                onChange={handleChange}
                placeholder="YYYY-MM-DD or ISO"
              />
            </div>

            <div className="space-y-2">
              <Label>Message (optional)</Label>
              <Textarea
                name="message"
                value={form.message}
                onChange={handleChange}
                rows={4}
              />
            </div>

            <div className="flex gap-2 pt-2 justify-end">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InvitationFormModal;
