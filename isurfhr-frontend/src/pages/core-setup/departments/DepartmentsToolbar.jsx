// src/components/admin/DepartmentsToolbar.jsx
import React from "react";
import TableOptions from "./DepartmentTableOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

/**
 * DepartmentsToolbar
 *
 * Props:
 *  - filters, onFilterChange
 *  - companyOptions
 *  - onAddDepartment()
 *  - onCopy(), onPrint(), onExport(format)
 */
const DepartmentsToolbar = ({
  filters = {},
  onFilterChange = () => {},
  companyOptions = [],
  onAddDepartment = () => {},
  onCopy = () => {},
  onPrint = () => {},
  onExport = () => {},
}) => {
  const handlePatch = (patch) => onFilterChange({ ...filters, ...patch });
  const clear = () => onFilterChange({ q: "", companyId: "" });

  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      {/* Left: Filters */}
      <div className="flex flex-wrap items-center gap-4 flex-1">
        {/* Search */}
        <Input
          className="w-72 h-10"
          placeholder="Search by department name or code"
          value={filters.q ?? ""}
          onChange={(e) => handlePatch({ q: e.target.value })}
        />

        {/* Company filter (only real companies shown) */}
        <Select
          value={filters.companyId ? String(filters.companyId) : ""}
          onValueChange={(v) => handlePatch({ companyId: v || "" })}
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

        {/* Clear */}
        <Button variant="outline" onClick={clear} className="h-10">
          Clear
        </Button>
      </div>

      {/* Right: Options + Add Department */}
      <div className="flex items-center gap-4">
        <TableOptions onCopy={onCopy} onPrint={onPrint} onExport={onExport} />
        <Button className="h-10" onClick={onAddDepartment}>
          Add Department
        </Button>
      </div>
    </div>
  );
};

export default DepartmentsToolbar;
