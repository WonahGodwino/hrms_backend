// src/components/onboarding/OnboardingFilter.jsx
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const PROGRESS_RANGES = [
  { label: "All progress", value: "__all__" },
  { label: "0% - 24%", value: "0-24" },
  { label: "25% - 49%", value: "25-49" },
  { label: "50% - 74%", value: "50-74" },
  { label: "75% - 99%", value: "75-99" },
  { label: "100% (Completed)", value: "100" },
];

const OnboardingFilter = ({
  filters = {},
  stages = [],
  onFilterChange = () => {},
}) => {
  const normalizeValue = (v) => (v === "__all__" ? "" : v);

  const handleChange = (name, value) => {
    onFilterChange({ [name]: normalizeValue(value) });
  };

  const clearFilters = () => {
    onFilterChange({
      search: "",
      stage: "",
      department: "",
      progressRange: "",
    });
  };

  return (
    <div className="bg-card py-4 rounded-md flex flex-col md:flex-row md:items-end gap-4">
      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <Label className="text-sm font-medium text-muted-foreground mb-1">
          Search
        </Label>
        <Input
          placeholder="Search by name, job title or email"
          value={filters.search ?? ""}
          onChange={(e) => handleChange("search", e.target.value)}
        />
      </div>

      {/* Stage */}
      <div className="w-56">
        <Label className="text-sm font-medium text-muted-foreground mb-1">
          Stage
        </Label>
        <Select
          value={filters.stage || "__all__"}
          onValueChange={(v) => handleChange("stage", v)}
        >
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Department */}
      <div className="w-56">
        <Label className="text-sm font-medium text-muted-foreground mb-1">
          Department
        </Label>
        <Input
          placeholder="e.g. Engineering"
          value={filters.department ?? ""}
          onChange={(e) => handleChange("department", e.target.value)}
        />
      </div>

      {/* Progress Range */}
      <div className="w-56">
        <Label className="text-sm font-medium text-muted-foreground mb-1">
          Progress
        </Label>
        <Select
          value={filters.progressRange || "__all__"}
          onValueChange={(v) => handleChange("progressRange", v)}
        >
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="All progress" />
          </SelectTrigger>
          <SelectContent>
            {PROGRESS_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 self-stretch md:self-end">
        <Button variant="outline" className="h-10" onClick={clearFilters}>
          Clear
        </Button>
      </div>
    </div>
  );
};

export default OnboardingFilter;
