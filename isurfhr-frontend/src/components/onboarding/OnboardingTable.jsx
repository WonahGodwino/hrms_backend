// src/components/onboarding/OnboardingTable.jsx
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import OnboardingActions from "./OnboardingActions";
import EmployeeDetailsModal from "./EmployeeDetailsModal";
import ProgressStatusBadge from "./ProgressStatusBadge";

/* ... ProgressStatusBadge unchanged ... */

const OnboardingTable = ({
  employees = [],
  onSendReminder = () => {},
  onQuickComplete = () => {},
}) => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleView = (employeeId) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    setSelectedEmployee(emp);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedEmployee(null);
  };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Job Title</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>Current Stage</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead className="w-[150px] text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((emp) => (
            <TableRow key={emp.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                    {emp.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{emp.name}</p>
                  </div>
                </div>
              </TableCell>

              <TableCell className="text-sm">{emp.jobTitle ?? "—"}</TableCell>
              <TableCell className="text-sm">{emp.department ?? "—"}</TableCell>
              <TableCell className="text-sm">{emp.startDate ?? "—"}</TableCell>

              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {emp.currentStage ?? "—"}
                </Badge>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="w-40">
                    <Progress value={emp.progressPercent ?? 0} />
                  </div>
                  <ProgressStatusBadge percent={emp.progressPercent ?? 0} />
                </div>
              </TableCell>

              <TableCell className="text-right">
                <OnboardingActions
                  employeeId={emp.id}
                  onView={handleView}
                  onReminder={onSendReminder}
                  onQuickComplete={onQuickComplete}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {employees.length > 0 && (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => console.log("Load more")}
          >
            Load more
          </Button>
        </div>
      )}

      {/* Employee details modal - controlled by modalOpen boolean */}
      <EmployeeDetailsModal
        open={modalOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCloseModal(); // parent updates state only on close
        }}
        employee={selectedEmployee}
      />
    </div>
  );
};

export default OnboardingTable;
