// src/pages/tasks/YourCreatedTasks.jsx
import React from "react";
import ManagerAssignedTasks from "@/components/tasks/ManagerAssignedTasks";

/**
 * YourCreatedTasks
 *
 * Page for manager / supervisor to view tasks they've created or assigned.
 * This component composes the ManagerAssignedTasks page (renamed) so you can
 * further add top-level routing, breadcrumbs, or additional controls here.
 */
export default function YourCreatedTasks() {
  // You can pass custom fetchUrl / assigneesUrl / reassignUrl props if needed.
  return (
    <div className="p-6">
      <ManagerAssignedTasks />
    </div>
  );
}
