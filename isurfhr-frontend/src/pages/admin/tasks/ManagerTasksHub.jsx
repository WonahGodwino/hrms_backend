// // src/pages/tasks/ManagerTasksHub.jsx
// import React, { useEffect, useMemo, useState } from "react";
// import {
//   PieChart,
//   Pie,
//   Cell,
//   Tooltip,
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   ResponsiveContainer,
//   Legend,
// } from "recharts";

// // shadcn components (adjust imports if your project uses slightly different names/paths)
// import { Button } from "@/components/ui/button";
// // import path corrected: TaskFormModal is the modal component implemented in the pages/tasks file
// import TaskFormModal from "@/components/tasks/TaskFormModal";
// import { Input } from "@/components/ui/input";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Label } from "@/components/ui/label";
// import { Card, CardHeader, CardContent } from "@/components/ui/card";
// import {
//   Table,
//   TableHeader,
//   TableRow,
//   TableHead,
//   TableBody,
//   TableCell,
// } from "@/components/ui/table";
// import { Badge } from "@/components/ui/badge";

// // Assigned tasks modal (converted to modal in ManagerAssignedTasks.jsx)
// import ManagerAssignedTasksModal from "@/components/tasks/ManagerAssignedTasks";

// export default function ManagerTasksHub({
//   fetchUrl = "/api/tasks/recent",
//   assigneesUrl = "/api/users",
//   createUrl = "/api/tasks",
//   assignedFetchUrl = "/api/tasks/assigned",
//   reassignUrl = "/api/tasks/reassign",
// }) {
//   const [tasks, setTasks] = useState([]);
//   const [assignees, setAssignees] = useState([]);
//   const [loadingTasks, setLoadingTasks] = useState(true);
//   const [loadingAssignees, setLoadingAssignees] = useState(true);
//   const [error, setError] = useState(null);
//   const [createOpen, setCreateOpen] = useState(false);

//   // assigned modal open
//   const [assignedOpen, setAssignedOpen] = useState(false);

//   // quick add form
//   const [quickTask, setQuickTask] = useState("");
//   const [quickAssignee, setQuickAssignee] = useState("");

//   // filters & search
//   const [statusFilter, setStatusFilter] = useState("All");
//   const [priorityFilter, setPriorityFilter] = useState("All");
//   const [dueFilter, setDueFilter] = useState("All");
//   const [search, setSearch] = useState("");

//   // Fetch tasks
//   useEffect(() => {
//     let mounted = true;
//     setLoadingTasks(true);
//     setError(null);
//     fetch(fetchUrl)
//       .then(async (res) => {
//         if (!res.ok) {
//           const text = await res.text().catch(() => "");
//           throw new Error(text || `Failed to fetch tasks (${res.status})`);
//         }
//         return res.json();
//       })
//       .then((data) => {
//         if (!mounted) return;
//         // support both an array at top-level or { data: [...] }
//         const list = Array.isArray(data) ? data : data?.data ?? [];
//         setTasks(list);
//       })
//       .catch((err) => {
//         if (!mounted) return;
//         console.error("Error fetching tasks:", err);
//         setError(err.message || "Failed to load tasks");
//       })
//       .finally(() => {
//         if (!mounted) return;
//         setLoadingTasks(false);
//       });

//     return () => {
//       mounted = false;
//     };
//   }, [fetchUrl]);

//   // Fetch assignees for quick-add dropdown
//   useEffect(() => {
//     let mounted = true;
//     setLoadingAssignees(true);
//     fetch(assigneesUrl)
//       .then(async (res) => {
//         if (!res.ok) {
//           const text = await res.text().catch(() => "");
//           throw new Error(text || `Failed to fetch users (${res.status})`);
//         }
//         return res.json();
//       })
//       .then((data) => {
//         if (!mounted) return;
//         const list = Array.isArray(data) ? data : data?.data ?? [];
//         setAssignees(list);
//       })
//       .catch((err) => {
//         if (!mounted) return;
//         console.error("Error fetching assignees:", err);
//       })
//       .finally(() => {
//         if (!mounted) return;
//         setLoadingAssignees(false);
//       });

//     return () => {
//       mounted = false;
//     };
//   }, [assigneesUrl]);

//   // Quick add handler: posts to createUrl then prepends to local list on success
//   const handleQuickAdd = async (e) => {
//     e.preventDefault();
//     if (!quickTask || !quickAssignee) return;

//     const payload = {
//       title: quickTask,
//       // support assignee passed as id or name depending on backend expectation
//       assigneeId: quickAssignee,
//       assignee:
//         assignees.find((a) => String(getId(a)) === String(quickAssignee))
//           ?.name ?? quickAssignee,
//     };

//     try {
//       const res = await fetch(createUrl, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!res.ok) {
//         const text = await res.text().catch(() => "");
//         throw new Error(text || `Failed to create task (${res.status})`);
//       }

//       const created = await res.json();
//       // backend might return created object directly or { data: created }
//       const newTask = Array.isArray(created)
//         ? created[0]
//         : created?.data ?? created;

//       // ensure shape and fallback fields
//       setTasks((prev) => [newTask, ...prev]);
//       setQuickTask("");
//       setQuickAssignee("");
//     } catch (err) {
//       console.error("Failed to create quick task:", err);
//       // keep UX simple here - you can wire up toast notifications in your project
//     }
//   };

//   // helpers to allow multiple API shapes
//   function getAssigneeName(t) {
//     if (!t) return "";
//     return (
//       t.assignee?.name ??
//       t.assigneeName ??
//       t.assignee ??
//       (t.assigneeId ? String(t.assigneeId) : "")
//     );
//   }
//   function getDue(t) {
//     if (!t) return "";
//     if (!t.due && t.dueDate) return t.dueDate;
//     return t.due;
//   }
//   function getId(obj) {
//     return obj?.id ?? obj?._id ?? obj?.userId ?? obj;
//   }

//   // Filtering logic: supports "All" sentinel
//   const filteredTasks = useMemo(() => {
//     return tasks.filter((t) => {
//       const status = t.status ?? "Open";
//       const priority = t.priority ?? "Medium";
//       const title = (t.title ?? "").toString().toLowerCase();

//       const statusMatch = statusFilter === "All" || status === statusFilter;
//       const priorityMatch =
//         priorityFilter === "All" || priority === priorityFilter;
//       const searchMatch = title.includes(search.toLowerCase());

//       // dueFilter minimal handling (Today / This Week / Overdue)
//       let dueMatch = true;
//       if (dueFilter && dueFilter !== "All") {
//         const dueValue = getDue(t);
//         if (!dueValue) dueMatch = dueFilter === "Overdue" ? false : true;
//         else {
//           const dueDate = new Date(dueValue);
//           const now = new Date();
//           if (dueFilter === "Today") {
//             dueMatch =
//               dueDate.getFullYear() === now.getFullYear() &&
//               dueDate.getMonth() === now.getMonth() &&
//               dueDate.getDate() === now.getDate();
//           } else if (dueFilter === "This Week") {
//             // week starting monday
//             const startOfWeek = new Date(now);
//             startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
//             startOfWeek.setHours(0, 0, 0, 0);
//             const endOfWeek = new Date(startOfWeek);
//             endOfWeek.setDate(startOfWeek.getDate() + 7);
//             dueMatch = dueDate >= startOfWeek && dueDate < endOfWeek;
//           } else if (dueFilter === "Overdue") {
//             dueMatch = dueDate < now;
//           }
//         }
//       }

//       return statusMatch && priorityMatch && searchMatch && dueMatch;
//     });
//   }, [tasks, statusFilter, priorityFilter, search, dueFilter]);

//   // Chart data derived from tasks
//   const statusData = useMemo(() => {
//     const open = tasks.filter((t) => (t.status ?? "Open") === "Open").length;
//     const inProgress = tasks.filter(
//       (t) => (t.status ?? "") === "In Progress"
//     ).length;
//     const completed = tasks.filter(
//       (t) => (t.status ?? "") === "Completed"
//     ).length;
//     const overdue = tasks.filter((t) => (t.status ?? "") === "Overdue").length;
//     return [
//       { name: "Open", value: open },
//       { name: "In Progress", value: inProgress },
//       { name: "Completed", value: completed },
//       { name: "Overdue", value: overdue },
//     ];
//   }, [tasks]);

//   const statusColors = ["#3B82F6", "#F59E0B", "#10B981", "#EF4444"];

//   const priorityData = useMemo(() => {
//     const high = tasks.filter((t) => (t.priority ?? "") === "High").length;
//     const medium = tasks.filter((t) => (t.priority ?? "") === "Medium").length;
//     const low = tasks.filter((t) => (t.priority ?? "") === "Low").length;
//     return [
//       { name: "High", value: high },
//       { name: "Medium", value: medium },
//       { name: "Low", value: low },
//     ];
//   }, [tasks]);

//   // Small stat card component using Card (shadcn)
//   // variantClass should be a combination of background and text classes, e.g. "bg-blue-50 text-blue-700"
//   const Stat = ({
//     label,
//     value,
//     variantClass = "bg-blue-50 text-blue-700",
//   }) => (
//     <Card className={`p-3 ${variantClass}`}>
//       <CardHeader className="p-0">
//         <div className="text-xs uppercase tracking-wide">{label}</div>
//       </CardHeader>
//       <CardContent className="p-0">
//         <div className="text-2xl font-bold">{value}</div>
//       </CardContent>
//     </Card>
//   );

//   return (
//     <div className="max-w-7xl mx-auto">
//       <div className="flex items-center justify-between mb-6">
//         <h1 className="text-2xl font-bold text-[#1180DA]">Task Management</h1>
//         <div className="flex gap-3">
//           <Button onClick={() => setCreateOpen(true)}>+ Create Task</Button>

//           {/* open assigned modal instead of navigating away */}
//           <Button variant="outline" onClick={() => setAssignedOpen(true)}>
//             View Assigned
//           </Button>
//         </div>
//       </div>

//       {/* Stats */}
//       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
//         <Stat label="Open" value={statusData[0]?.value ?? 0} />
//         <Stat
//           label="In Progress"
//           value={statusData[1]?.value ?? 0}
//           variantClass="bg-amber-100 text-amber-700"
//         />
//         <Stat
//           label="Completed (7d)"
//           value={statusData[2]?.value ?? 0}
//           variantClass="bg-emerald-100 text-emerald-700"
//         />
//         <Stat
//           label="Overdue"
//           value={statusData[3]?.value ?? 0}
//           variantClass="bg-rose-100 text-rose-700"
//         />
//       </div>

//       {/* Top Row: Quick Create + Filter Bar */}
//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
//         {/* Quick Task */}
//         <Card className="p-4">
//           <CardHeader className="p-0 mb-2">
//             <h3 className="font-semibold">Quick Task</h3>
//           </CardHeader>

//           <CardContent className="p-0">
//             <form onSubmit={handleQuickAdd} className="flex flex-col gap-4">
//               {/* Title */}
//               <div className="flex flex-col gap-1">
//                 <Label htmlFor="quickTask" className="text-sm">
//                   Title
//                 </Label>
//                 <Input
//                   id="quickTask"
//                   placeholder="Task title..."
//                   value={quickTask}
//                   onChange={(e) => setQuickTask(e.target.value)}
//                   className="w-full"
//                 />
//               </div>

//               {/* Assignee */}
//               <div className="flex flex-col gap-1">
//                 <Label htmlFor="quickAssignee" className="text-sm">
//                   Assign to
//                 </Label>

//                 {/* show the Select; provide visual disabled state while loading */}
//                 <div
//                   className={`w-full ${
//                     loadingAssignees ? "opacity-80 pointer-events-none" : ""
//                   }`}
//                 >
//                   <Select
//                     value={quickAssignee}
//                     onValueChange={(val) => setQuickAssignee(val)}
//                   >
//                     <SelectTrigger
//                       id="quickAssignee"
//                       className="w-full"
//                       // disable opening while loading or when no assignees
//                       disabled={loadingAssignees || assignees.length === 0}
//                     >
//                       <SelectValue
//                         placeholder={
//                           loadingAssignees
//                             ? "Loading assignees..."
//                             : "Assign to..."
//                         }
//                       />
//                     </SelectTrigger>

//                     <SelectContent className="max-h-60 overflow-auto">
//                       {assignees.length > 0 ? (
//                         assignees.map((a, idx) => {
//                           // ensure we always have a non-empty value for the item
//                           const rawId = getId(a);
//                           const fallbackId =
//                             a?.email ?? a?.name ?? `assignee-${idx}`;
//                           const id = rawId ?? fallbackId;
//                           const display =
//                             a?.name ?? a?.fullName ?? a?.username ?? String(id);

//                           return (
//                             <SelectItem key={String(id)} value={String(id)}>
//                               {display}
//                             </SelectItem>
//                           );
//                         })
//                       ) : (
//                         // DON'T use <SelectItem value=""> here — use plain text so Radix doesn't complain
//                         <div className="p-2 text-sm text-muted-foreground">
//                           {loadingAssignees ? "Loading…" : "No assignees found"}
//                         </div>
//                       )}
//                     </SelectContent>
//                   </Select>
//                 </div>
//               </div>

//               {/* Submit */}
//               <div>
//                 <Button
//                   type="submit"
//                   className="w-full"
//                   disabled={!quickTask || !quickAssignee}
//                 >
//                   Add Task
//                 </Button>
//               </div>
//             </form>
//           </CardContent>
//         </Card>

//         {/* Filter Bar */}
//         <Card className="p-4 lg:col-span-2">
//           <CardHeader className="p-0">
//             <h3 className="font-semibold mb-3">Filter Tasks</h3>
//           </CardHeader>
//           <CardContent className="p-0">
//             <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
//               <Select
//                 value={statusFilter}
//                 onValueChange={(v) => setStatusFilter(v)}
//               >
//                 <SelectTrigger className="w-full">
//                   <SelectValue placeholder="All Statuses" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="All">All Statuses</SelectItem>
//                   <SelectItem value="Open">Open</SelectItem>
//                   <SelectItem value="In Progress">In Progress</SelectItem>
//                   <SelectItem value="Completed">Completed</SelectItem>
//                   <SelectItem value="Overdue">Overdue</SelectItem>
//                 </SelectContent>
//               </Select>

//               <Select
//                 value={priorityFilter}
//                 onValueChange={(v) => setPriorityFilter(v)}
//               >
//                 <SelectTrigger className="w-full">
//                   <SelectValue placeholder="All Priorities" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="All">All Priorities</SelectItem>
//                   <SelectItem value="High">High</SelectItem>
//                   <SelectItem value="Medium">Medium</SelectItem>
//                   <SelectItem value="Low">Low</SelectItem>
//                 </SelectContent>
//               </Select>

//               <Select value={dueFilter} onValueChange={(v) => setDueFilter(v)}>
//                 <SelectTrigger className="w-full">
//                   <SelectValue placeholder="All Due Dates" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="All">All Due Dates</SelectItem>
//                   <SelectItem value="Today">Today</SelectItem>
//                   <SelectItem value="This Week">This Week</SelectItem>
//                   <SelectItem value="Overdue">Overdue</SelectItem>
//                 </SelectContent>
//               </Select>

//               <Input
//                 placeholder="Search…"
//                 value={search}
//                 onChange={(e) => setSearch(e.target.value)}
//               />
//             </div>
//           </CardContent>
//         </Card>
//       </div>

//       {/* Charts Row */}
//       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
//         {/* Status Distribution */}
//         <Card className="p-4">
//           <CardHeader className="p-0">
//             <h3 className="font-semibold mb-3">Task Status Distribution</h3>
//           </CardHeader>
//           <CardContent className="p-0">
//             <ResponsiveContainer width="100%" height={250}>
//               <PieChart>
//                 <Pie
//                   data={statusData}
//                   dataKey="value"
//                   nameKey="name"
//                   cx="50%"
//                   cy="50%"
//                   outerRadius={90}
//                   label
//                 >
//                   {statusData.map((entry, index) => (
//                     <Cell
//                       key={index}
//                       fill={statusColors[index % statusColors.length]}
//                     />
//                   ))}
//                 </Pie>
//                 <Tooltip />
//                 <Legend />
//               </PieChart>
//             </ResponsiveContainer>
//           </CardContent>
//         </Card>

//         {/* Priority Distribution */}
//         <Card className="p-4">
//           <CardHeader className="p-0">
//             <h3 className="font-semibold mb-3">Task Priority Distribution</h3>
//           </CardHeader>
//           <CardContent className="p-0">
//             <ResponsiveContainer width="100%" height={250}>
//               <BarChart data={priorityData}>
//                 <CartesianGrid strokeDasharray="3 3" />
//                 <XAxis dataKey="name" />
//                 <YAxis allowDecimals={false} />
//                 <Tooltip />
//                 <Bar dataKey="value" fill="#3B82F6" />
//               </BarChart>
//             </ResponsiveContainer>
//           </CardContent>
//         </Card>
//       </div>

//       {/* Recent Tasks */}
//       <Card className="p-4">
//         <div className="flex items-center justify-between mb-2">
//           <h3 className="font-semibold">Recent Tasks</h3>
//           <button
//             className="text-[#1180DA] text-sm hover:underline"
//             onClick={() => setAssignedOpen(true)}
//           >
//             View all →
//           </button>
//         </div>

//         <div className="overflow-x-auto">
//           {loadingTasks ? (
//             <div className="p-6 text-center text-sm text-muted-foreground">
//               Loading tasks…
//             </div>
//           ) : error ? (
//             <div className="p-6 text-center text-sm text-red-600">
//               Error: {error}
//             </div>
//           ) : (
//             <Table>
//               <TableHeader>
//                 <TableRow>
//                   <TableHead>Task</TableHead>
//                   <TableHead>Assignee</TableHead>
//                   <TableHead>Priority</TableHead>
//                   <TableHead>Status</TableHead>
//                   <TableHead>Due</TableHead>
//                 </TableRow>
//               </TableHeader>
//               <TableBody>
//                 {filteredTasks.length > 0 ? (
//                   filteredTasks.map((t) => {
//                     const assignee = getAssigneeName(t);
//                     const priority = t.priority ?? "Medium";
//                     const status = t.status ?? "Open";
//                     const due = getDue(t);
//                     const dueDisplay = due
//                       ? new Date(due).toLocaleDateString()
//                       : "—";
//                     return (
//                       <TableRow key={t.id ?? t._id ?? JSON.stringify(t)}>
//                         <TableCell>{t.title}</TableCell>
//                         <TableCell>{assignee}</TableCell>
//                         <TableCell>
//                           <Badge
//                             className={`px-2 py-1 text-xs ${
//                               priority === "High"
//                                 ? "bg-rose-100 text-rose-700"
//                                 : priority === "Medium"
//                                 ? "bg-amber-100 text-amber-700"
//                                 : "bg-emerald-100 text-emerald-700"
//                             }`}
//                           >
//                             {priority}
//                           </Badge>
//                         </TableCell>
//                         <TableCell>{status}</TableCell>
//                         <TableCell>{dueDisplay}</TableCell>
//                       </TableRow>
//                     );
//                   })
//                 ) : (
//                   <TableRow>
//                     <TableCell
//                       colSpan={5}
//                       className="text-center p-4 text-gray-500"
//                     >
//                       No tasks match your filter.
//                     </TableCell>
//                   </TableRow>
//                 )}
//               </TableBody>
//             </Table>
//           )}
//         </div>
//       </Card>

//       <TaskFormModal
//         open={createOpen}
//         onOpenChange={setCreateOpen}
//         assignees={assignees} // reuse the assignees fetched in ManagerTasksHub
//         createUrl={createUrl} // optional, default is '/api/tasks'
//         onCreate={(newTask) => {
//           // prepend the created task to the existing tasks state so it appears in lists and charts
//           setTasks((prev) => [newTask, ...prev]);
//         }}
//       />

//       {/* Assigned Tasks Modal */}
//       {/* <ManagerAssignedTasksModal
//         open={assignedOpen}
//         onOpenChange={setAssignedOpen}
//         fetchUrl={assignedFetchUrl}
//         assigneesUrl={assigneesUrl}
//         reassignUrl={reassignUrl}
//         // pass already-fetched assignees so modal doesn't need to wait
//         // NOTE: the modal still fetches assignees when opened, but this helps immediate rendering
//         // if you want the modal to rely solely on this data, modify the modal to accept `assignees` prop.
//         // For now we pass it so modal can use it if implemented to accept it.
//         assignees={assignees}
//       /> */}
//     </div>
//   );
// }
