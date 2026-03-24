// src/pages/onboarding/OnboardingProgressTab.jsx
import { useState } from "react";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingFilter from "@/components/onboarding/OnboardingFilter";
import OnboardingTable from "@/components/onboarding/OnboardingTable";
import EmployeeDetailsModal from "./EmployeeDetailsModal";
import EmptyState from "@/components/EmptyState";

export default function OnboardingProgressTab() {
  const [employees, setEmployees] = useState([
    {
      id: 1,
      name: "Jane Doe",
      role: "Software Engineer",
      department: "Engineering",
      status: "in-progress",
      stepsCompleted: 3,
      totalSteps: 5,
      startDate: "2025-08-01",
    },
    {
      id: 2,
      name: "John Smith",
      role: "HR Manager",
      department: "Human Resources",
      status: "completed",
      stepsCompleted: 5,
      totalSteps: 5,
      startDate: "2025-07-15",
    },
  ]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [filters, setFilters] = useState({ department: "", status: "" });

  // Filtering logic
  const filteredEmployees = employees.filter((emp) => {
    return (
      (filters.department ? emp.department === filters.department : true) &&
      (filters.status ? emp.status === filters.status : true)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <OnboardingHeader total={employees.length} />

      {/* Filters */}
      <OnboardingFilter filters={filters} onFilterChange={setFilters} />

      {/* Table or Empty State */}
      {filteredEmployees.length > 0 ? (
        <OnboardingTable
          employees={filteredEmployees}
          onSelectEmployee={setSelectedEmployee}
        />
      ) : (
        <EmptyState
          message="No employees match your current filters"
          onAddEmployee={() => console.log("Redirect to Add Employee form")}
        />
      )}

      {/* Drawer / Modal for Employee Details */}
      {selectedEmployee && (
        <EmployeeDetailsModal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}
