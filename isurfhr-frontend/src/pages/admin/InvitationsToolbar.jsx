// src/components/admin/InvitationsToolbar.jsx
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import InviteStatusBadge from "@/components/ui/InviteStatusBadge";

/**
 * InvitationsToolbar
 *
 * Props:
 *  - filters: { q, companyId, status }
 *  - onFilterChange(newFilters)
 *  - companyOptions: [{ id, name }]
 *  - onAddInvitation()
 *  - onRefresh() optional
 */
const InvitationsToolbar = ({
  filters = { q: "", companyId: "", status: "" },
  onFilterChange = () => {},
  companyOptions = [],
  onAddInvitation = () => {},
  onRefresh,
}) => {
  // Normalize filter values before sending them up so the rest of the app
  // can rely on predictable shapes (status lowercase, companyId as string).
  const update = (patch) => {
    const next = { ...filters, ...patch };

    if ("status" in patch) {
      next.status = next.status ? String(next.status).trim().toLowerCase() : "";
    }

    if ("companyId" in patch) {
      // keep companyId as string (empty string means "all")
      next.companyId = next.companyId != null ? String(next.companyId) : "";
    }

    if ("q" in patch) {
      // allow user to type freely, but normalize null/undefined to empty string
      next.q = next.q ?? "";
    }

    onFilterChange(next);
  };

  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <Label className="text-sm font-medium mb-1">Search</Label>
          <Input
            placeholder="Search by email or token"
            value={filters.q || ""}
            onChange={(e) => update({ q: e.target.value })}
            className="w-64"
          />
        </div>

        <div className="flex flex-col">
          <Label className="text-sm font-medium mb-1">Company</Label>
          <Select
            value={filters.companyId ?? ""}
            onValueChange={(v) => update({ companyId: v })}
          >
            <SelectTrigger className="w-56 h-10">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All companies</SelectItem>
              {companyOptions.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col">
          <Label className="text-sm font-medium mb-1">Status</Label>
          <Select
            value={filters.status ?? ""}
            onValueChange={(v) => update({ status: v })}
          >
            <SelectTrigger className="w-40 h-10">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Any</span>
                </div>
              </SelectItem>

              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <InviteStatusBadge status="pending" size="sm" />
                  <span className="text-sm">Pending</span>
                </div>
              </SelectItem>

              <SelectItem value="accepted">
                <div className="flex items-center gap-2">
                  <InviteStatusBadge status="accepted" size="sm" />
                  <span className="text-sm">Accepted</span>
                </div>
              </SelectItem>

              <SelectItem value="revoked">
                <div className="flex items-center gap-2">
                  <InviteStatusBadge status="revoked" size="sm" />
                  <span className="text-sm">Revoked</span>
                </div>
              </SelectItem>

              <SelectItem value="expired">
                <div className="flex items-center gap-2">
                  <InviteStatusBadge status="expired" size="sm" />
                  <span className="text-sm">Expired</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {onRefresh && (
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onAddInvitation}>New Invitation</Button>
      </div>
    </div>
  );
};

export default InvitationsToolbar;
