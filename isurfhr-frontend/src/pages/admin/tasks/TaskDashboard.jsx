// // src/pages/tasks/TaskDashboard.jsx
// import React from "react";
// // Fixed import path: changed alias @ to relative path
// import { useAuth } from "@/lib/context/AuthContext";
// // Fixed import path: changed alias @ to relative path
// import AdminTaskDashboard from "./AdminTaskDashboard";
// // Assuming these are in the same folder as TaskDashboard.jsx
// import ManagerTasksHub from "./ManagerTasksHub";
// import StaffTasksHub from "./StaffTasksHub";
// import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// /**
//  * TaskDashboard parent:
//  * - Renders the role-appropriate subcomponent.
//  * - If SUPER_ADMIN, show tabs to jump between all three views.
//  *
//  * NOTE: If your ManagerTasksHub or StaffTasksHub files are elsewhere,
//  * update the import paths above.
//  */
// export default function TaskDashboard() {
//   const { user } = useAuth();
//   // Normalize role to uppercase to match system standard (SUPER_ADMIN, ADMIN, HR, STAFF)
//   const role = (user?.role || "").toString().toUpperCase();

//   if (role === "SUPER_ADMIN") {
//     return (
//       <Tabs defaultValue="admin">
//         <TabsList>
//           <TabsTrigger value="admin">Admin / HR</TabsTrigger>
//           <TabsTrigger value="supervisor">Manager View</TabsTrigger>
//           <TabsTrigger value="staff">Staff</TabsTrigger>
//         </TabsList>
//         <TabsContent value="admin">
//           <AdminTaskDashboard />
//         </TabsContent>
//         <TabsContent value="supervisor">
//           <ManagerTasksHub />
//         </TabsContent>
//         <TabsContent value="staff">
//           <StaffTasksHub />
//         </TabsContent>
//       </Tabs>
//     );
//   }

//   // ADMIN and HR see the Admin Task Dashboard
//   if (["ADMIN", "HR"].includes(role)) {
//     return <AdminTaskDashboard />;
//   }

//   // Fallback for legacy SUPERVISOR role or if specific manager view is needed
//   if (["SUPERVISOR", "MANAGER"].includes(role)) {
//     return <ManagerTasksHub />;
//   }

//   // STAFF sees the Staff Tasks Hub
//   if (role === "STAFF") {
//     return <StaffTasksHub />;
//   }

//   return <div>No access</div>;
// }
