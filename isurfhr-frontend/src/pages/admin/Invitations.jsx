// src/pages/admin/Invitations.jsx
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import InvitationService from "@/services/InvitationService";
import { getCompanies } from "@/services/CompanyService";

import InvitationsToolbar from "@/components/admin/InvitationsToolbar";
import InvitationRowActions from "@/components/admin/InvitationRowActions";
import InvitationFormModal from "@/components/admin/InvitationFormModal";
import InviteStatusBadge from "@/components/ui/InviteStatusBadge";

const DEFAULT_PAGE_SIZE = 20;

const Invitations = () => {
  const [invitations, setInvitations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ q: "", status: "", companyId: "" });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const extractInvitationsFromResponse = (resp) => {
    if (!resp) return [];
    const val = resp.data ?? resp;
    if (Array.isArray(val)) return val;
    if (Array.isArray(val.invitations)) return val.invitations;
    if (Array.isArray(val.items)) return val.items;
    if (Array.isArray(val.results)) return val.results;
    if (Array.isArray(val.rows)) return val.rows;
    if (val.data && Array.isArray(val.data.invitations))
      return val.data.invitations;
    if (val.data && Array.isArray(val.data.items)) return val.data.items;
    if (val.data && Array.isArray(val.data.results)) return val.data.results;
    if (val && (val.id || val._id || val.token || val.email)) return [val];
    return [];
  };

  const extractTotalFromResponse = (resp) => {
    if (!resp) return null;
    const val = resp.data ?? resp;
    if (typeof val.total === "number") return val.total;
    if (val.meta && typeof val.meta.total === "number") return val.meta.total;
    if (val.data && typeof val.data.total === "number") return val.data.total;
    if (val.data && val.data.meta && typeof val.data.meta.total === "number")
      return val.data.meta.total;
    return null;
  };

  const load = async () => {
    setLoading(true);
    try {
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== "" && v != null)
      );

      const params = { ...cleanFilters, page, limit: pageSize };

      const [invRes, compRes] = await Promise.allSettled([
        InvitationService.getInvitations(params),
        getCompanies({ q: "" }),
      ]);

      let invData = [];
      if (invRes.status === "fulfilled") {
        invData = extractInvitationsFromResponse(invRes.value);
      } else {
        console.warn("Failed to fetch invitations", invRes.reason);
      }

      let compData = [];
      if (compRes.status === "fulfilled") {
        const compVal = compRes.value?.data ?? compRes.value ?? compRes;
        if (Array.isArray(compVal)) compData = compVal;
        else if (Array.isArray(compVal.companies)) compData = compVal.companies;
        else if (Array.isArray(compVal.data)) compData = compVal.data;
        else compData = [];
      }

      setInvitations(Array.isArray(invData) ? invData : []);
      setCompanies(Array.isArray(compData) ? compData : []);

      const totalFromResp =
        invRes.status === "fulfilled" && extractTotalFromResponse(invRes.value);
      if (typeof totalFromResp === "number") setTotal(totalFromResp);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load invitations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  const handleResend = async (id) => {
    try {
      await InvitationService.resendInvitation(id);
      toast.success("Invitation resent");
      load();
    } catch (err) {
      console.error(err);
      toast.error("Failed to resend invitation");
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm("Revoke this invitation?")) return;
    try {
      await InvitationService.revokeInvitation(id);
      toast.success("Invitation revoked");
      setInvitations((p) => p.filter((i) => i.id !== id && i._id !== id));
    } catch (err) {
      console.error(err);
      toast.error("Failed to revoke invitation");
    }
  };

  const handleCreateLocal = (created) => {
    // optimistic: show a lightweight placeholder instantly
    const placeholder = {
      id: `temp-${Date.now()}`,
      email: created.email,
      companyId: created.companyId,
      companyName:
        companies.find((c) => String(c.id) === String(created.companyId))
          ?.name ?? "—",
      status: "pending",
      note: "Invite sent by email",
    };
    setInvitations((p) => [placeholder, ...p]);

    // then refresh from backend to get the real list
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invitations</h1>

        <div className="w-2/3">
          <InvitationsToolbar
            filters={filters}
            onFilterChange={(newFilters) => {
              setPage(1);
              setFilters(newFilters);
            }}
            companyOptions={companies}
            onAddInvitation={() => setIsModalOpen(true)}
            onRefresh={load}
          />
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="py-2">Email</th>
                  <th className="py-2">Company</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Expires</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm">
                      Loading...
                    </td>
                  </tr>
                ) : invitations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm">
                      No invitations found
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => (
                    <tr key={inv.id ?? inv._id} className="border-t">
                      <td className="py-3">{inv.email}</td>
                      <td className="py-3">
                        {inv.companyName ?? inv.company?.name ?? "—"}
                      </td>
                      <td className="py-3">
                        <InviteStatusBadge
                          status={
                            inv.status ??
                            inv.state ??
                            inv.statusType ??
                            "pending"
                          }
                          size="sm"
                        />
                      </td>
                      <td className="py-3">
                        {(inv.expiresAt ?? inv.expires_at ?? inv.expires) ||
                          "—"}
                      </td>
                      <td className="py-3">
                        <InvitationRowActions
                          id={inv.id ?? inv._id}
                          invitation={inv}
                          onResend={handleResend}
                          onRevoke={handleRevoke}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Total: {total || invitations.length}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </Button>
              <div className="px-3 py-1 bg-muted rounded">{page}</div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={invitations.length < pageSize}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <InvitationFormModal
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        companyOptions={companies}
        onCreated={handleCreateLocal}
      />
    </div>
  );
};

export default Invitations;
