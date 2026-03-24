// src/components/onboarding/OnboardingActions.jsx
import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  Mail,
  Check,
  MoreHorizontal,
  UserPlus,
  Download,
} from "lucide-react";

/**
 * OnboardingActions
 *
 * Props:
 * - employeeId: string
 * - onView (employeeId) => void    // open detail view
 * - onReminder (employeeId, taskId?) => void
 * - onQuickComplete (employeeId) => void
 * - onAssignMentor (employeeId) => void (optional)
 * - onExportChecklist (employeeId) => void (optional)
 * - disabled: boolean (optional)
 * - className: string (optional)
 *
 * Notes:
 * - This component is purely presentational. All handlers are passed in from parent.
 * - It keeps a small footprint so it works well inside table rows.
 */
const OnboardingActions = ({
  employeeId,
  onView,
  onReminder,
  onQuickComplete,
  onAssignMentor,
  onExportChecklist,
  disabled = false,
  className = "",
}) => {
  // support alternate prop name
  const handleView = () => {
    if (typeof onView === "function") onView(employeeId);
  };

  const handleReminder = () => {
    if (typeof onReminder === "function") onReminder(employeeId);
  };

  const handleQuickComplete = () => {
    if (typeof onQuickComplete === "function") onQuickComplete(employeeId);
  };

  const handleAssignMentor = () => {
    if (typeof onAssignMentor === "function") onAssignMentor(employeeId);
  };

  const handleExport = () => {
    if (typeof onExportChecklist === "function") onExportChecklist(employeeId);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleView}
        disabled={disabled}
        className="p-2"
        aria-label="View details"
        title="View details"
      >
        <Eye className="w-4 h-4" />
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={handleReminder}
        disabled={disabled}
        className="p-2"
        aria-label="Send reminder"
        title="Send reminder"
      >
        <Mail className="w-4 h-4" />
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={handleQuickComplete}
        disabled={disabled}
        className="p-2"
        aria-label="Mark next task complete"
        title="Mark next task complete"
      >
        <Check className="w-4 h-4" />
      </Button>

      {/* overflow menu for less common actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="p-2"
            aria-label="More actions"
            title="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem
            onClick={() => {
              handleAssignMentor();
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Assign Mentor
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              handleExport();
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Checklist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default OnboardingActions;
