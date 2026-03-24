// src/components/admin/BusinessUnitsToolbar.jsx
import React from "react";
import TableOptions from "./BusinessUnitTableOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const ALL = "__all__";

/**
 * BusinessUnitsToolbar
 *
 * Props:
 *  - filters, onFilterChange
 *  - departmentOptions
 *  - companyOptions
 *  - onAddBusinessUnit()
 *  - onCopy(), onPrint(), onExport(format)
 */
const BusinessUnitsToolbar = ({
  filters = {},
  onFilterChange = () => {},
  departmentOptions = [],
  companyOptions = [],
  onAddBusinessUnit = () => {},
  onCopy = () => {},
  onPrint = () => {},
  onExport = () => {},
}) => {
  const handlePatch = (patch) => onFilterChange({ ...filters, ...patch });
  const clear = () =>
    onFilterChange({ q: "", departmentId: "", companyId: "" });

  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      {/* Left: Filters */}
      <div className="flex flex-wrap items-center gap-4 flex-1">
        {/* Search */}
        <Input
          className="w-64 h-10"
          placeholder="Search by unit name or code"
          value={filters.q ?? ""}
          onChange={(e) => handlePatch({ q: e.target.value })}
        />

        {/* Company filter (only real companies shown) */}
        <Select
          value={filters.companyId ? String(filters.companyId) : ""}
          onValueChange={(v) =>
            // whenever company changes, clear department filter to avoid stale selection
            handlePatch({ companyId: v || "", departmentId: "" })
          }
        >
          <SelectTrigger className="w-56 h-10">
            <SelectValue placeholder="Select company" />
          </SelectTrigger>
          <SelectContent>
            {companyOptions
              .filter((c) => c && c.id !== undefined && c.id !== null)
              .map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Direct report / Department filter */}
        <Select
          value={filters.departmentId ? String(filters.departmentId) : ALL}
          onValueChange={(v) =>
            handlePatch({ departmentId: v === ALL ? "" : v })
          }
        >
          <SelectTrigger className="w-56 h-10">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departmentOptions
              .filter((d) => d && d.id !== undefined && d.id !== null)
              .map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Clear */}
        <Button variant="outline" onClick={clear} className="h-10">
          Clear
        </Button>
      </div>

      {/* Right: Options + Add Business Unit */}
      <div className="flex items-center gap-4">
        <TableOptions onCopy={onCopy} onPrint={onPrint} onExport={onExport} />
        <Button className="h-10" onClick={onAddBusinessUnit}>
          Add Business Unit
        </Button>
      </div>
    </div>
  );
};

export default BusinessUnitsToolbar;
