// // src/pages/tasks/TaskFormModal.jsx
// import React, { useState, useEffect } from "react";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import {
//   Select,
//   SelectTrigger,
//   SelectValue,
//   SelectContent,
//   SelectItem,
// } from "@/components/ui/select";

// import { createTask } from "@/services/TaskService";
// import { getCompanies } from "@/services/CompanyService";
// import { getDepartments } from "@/services/DepartmentService";
// import { getStaff } from "@/services/StaffService";

// export default function TaskFormModal({
//   open,
//   onOpenChange,
//   assignees = [], // optional prop (parent can provide)
//   onCreate,
// }) {
//   const [formData, setFormData] = useState({
//     task: "",
//     department: "",
//     assignee: "",
//     companyId: "",
//     priority: "",
//     status: "",
//     due: "",
//   });

//   const [companies, setCompanies] = useState([]);
//   const [departments, setDepartments] = useState([]);
//   const [assigneesLocal, setAssigneesLocal] = useState([]); // normalized assignees from staff API
//   const [submitting, setSubmitting] = useState(false);
//   const [errors, setErrors] = useState(null);

//   // helper: tolerant id/display resolution
//   const getId = (obj) => obj?.id ?? obj?._id ?? obj?.userId ?? obj;
//   const getDisplayName = (obj) =>
//     obj?.fullName ??
//     obj?.name ??
//     obj?.username ??
//     obj?.email ??
//     String(getId(obj) ?? "");

//   // Reset form when modal closes
//   useEffect(() => {
//     if (!open) {
//       setFormData({
//         task: "",
//         department: "",
//         assignee: "",
//         companyId: "",
//         priority: "",
//         status: "",
//         due: "",
//       });
//       setErrors(null);
//       setSubmitting(false);
//       // keep fetched lists (companies/departments) cached across opens
//     }
//   }, [open]);

//   // Fetch companies, departments and staff (if no assignees prop) when modal opens
//   useEffect(() => {
//     if (!open) return;
//     let mounted = true;

//     (async () => {
//       try {
//         // fetch companies and departments always; staff only if caller didn't pass assignees
//         const calls = [getCompanies(), getDepartments()];
//         if (!assignees || assignees.length === 0) calls.push(getStaff());

//         const results = await Promise.allSettled(calls);

//         // getCompanies -> results[0]
//         if (results[0].status === "fulfilled") {
//           const res = results[0].value;
//           if (mounted) setCompanies(res.data?.data ?? res.data ?? []);
//         } else {
//           console.error("Failed to load companies:", results[0].reason);
//         }

//         // getDepartments -> results[1]
//         if (results[1].status === "fulfilled") {
//           const res = results[1].value;
//           if (mounted) setDepartments(res.data?.data ?? res.data ?? []);
//         } else {
//           console.error("Failed to load departments:", results[1].reason);
//         }

//         // staff -> results[2] when fetched
//         if (calls.length === 3) {
//           const staffRes = results[2];
//           if (staffRes.status === "fulfilled") {
//             const res = staffRes.value;
//             // Normalize: API may return list of envelopes like { staff: {...}, ... } or plain staff objects
//             const raw = res.data?.data ?? res.data ?? [];
//             const normalized = Array.isArray(raw)
//               ? raw
//                   .map((item) => {
//                     // if envelope has 'staff' key, use it; otherwise use item itself
//                     const candidate = item && item.staff ? item.staff : item;
//                     return candidate;
//                   })
//                   .filter(Boolean) // remove nulls
//               : [];
//             if (mounted) setAssigneesLocal(normalized);
//           } else {
//             console.error("Failed to load staff:", staffRes.reason);
//             if (mounted) setAssigneesLocal([]);
//           }
//         } else {
//           // parent provided assignees prop — normalize that instead
//           const normalizedFromProp = (assignees || [])
//             .map((a) => (a && a.staff ? a.staff : a))
//             .filter(Boolean);
//           if (mounted) setAssigneesLocal(normalizedFromProp);
//         }
//       } catch (err) {
//         console.error("Failed to load companies/departments/staff:", err);
//       }
//     })();

//     return () => {
//       mounted = false;
//     };
//   }, [open, assignees]);

//   const handleChange = (e) => {
//     const { name, value } = e.target;
//     setFormData((s) => ({ ...s, [name]: value }));
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setErrors(null);

//     const required = [
//       "task",
//       "department",
//       "assignee",
//       "companyId",
//       "priority",
//       "status",
//       "due",
//     ];
//     const missing = required.filter((k) => !formData[k]);
//     if (missing.length) {
//       setErrors("Please fill all required fields.");
//       return;
//     }

//     setSubmitting(true);
//     try {
//       const res = await createTask(formData);
//       const created = res.data?.data ?? res.data;

//       if (typeof onCreate === "function") {
//         onCreate(created);
//       }
//       onOpenChange?.(false);
//     } catch (err) {
//       console.error("Create task failed:", err);
//       setErrors(err.message || "Failed to create task");
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   // pick source list for select: normalized local list (from API or prop)
//   const assigneeOptions = Array.isArray(assigneesLocal) ? assigneesLocal : [];

//   // helper to convert ISO <-> yyyy-MM-dd for input[type=date]
//   const isoToDateInput = (iso) => {
//     if (!iso) return "";
//     try {
//       return new Date(iso).toISOString().slice(0, 10);
//     } catch {
//       return "";
//     }
//   };
//   const dateInputToIso = (val) => {
//     if (!val) return "";
//     const d = new Date(val + "T00:00:00.000Z");
//     return d.toISOString();
//   };

//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogContent className="max-w-3xl w-full p-6">
//         <DialogHeader>
//           <DialogTitle>Create Task</DialogTitle>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
//           {/* Company Select */}
//           <div>
//             <Label htmlFor="companyId">
//               Company <span className="text-red-500">*</span>
//             </Label>
//             <Select
//               value={formData.companyId}
//               onValueChange={(v) =>
//                 setFormData((s) => ({ ...s, companyId: v }))
//               }
//             >
//               <SelectTrigger id="companyId">
//                 <SelectValue placeholder="Select Company" />
//               </SelectTrigger>
//               <SelectContent>
//                 {companies.length > 0 ? (
//                   companies.map((c) => (
//                     <SelectItem key={getId(c)} value={String(getId(c))}>
//                       {c.name ?? c.companyName ?? String(getId(c))}
//                     </SelectItem>
//                   ))
//                 ) : (
//                   <SelectItem value="__no_companies__" disabled>
//                     No companies available
//                   </SelectItem>
//                 )}
//               </SelectContent>
//             </Select>
//           </div>

//           {/* Task Title */}
//           <div>
//             <Label htmlFor="task">
//               Task <span className="text-red-500">*</span>
//             </Label>
//             <Input
//               id="task"
//               name="task"
//               value={formData.task}
//               onChange={handleChange}
//             />
//           </div>

//           {/* Department & Assignee (same line) */}
//           <div className="grid grid-cols-2 gap-4">
//             <div>
//               <Label htmlFor="department">
//                 Department <span className="text-red-500">*</span>
//               </Label>
//               <Select
//                 value={formData.department}
//                 onValueChange={(v) =>
//                   setFormData((s) => ({ ...s, department: v }))
//                 }
//               >
//                 <SelectTrigger id="department">
//                   <SelectValue placeholder="Select Department" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {departments.length > 0 ? (
//                     departments.map((d) => (
//                       <SelectItem key={getId(d)} value={String(getId(d))}>
//                         {d.name ?? d.departmentName ?? String(getId(d))}
//                       </SelectItem>
//                     ))
//                   ) : (
//                     <SelectItem value="__no_departments__" disabled>
//                       No departments available
//                     </SelectItem>
//                   )}
//                 </SelectContent>
//               </Select>
//             </div>

//             <div>
//               <Label htmlFor="assignee">
//                 Assignee <span className="text-red-500">*</span>
//               </Label>
//               <Select
//                 value={formData.assignee}
//                 onValueChange={(v) =>
//                   setFormData((s) => ({ ...s, assignee: v }))
//                 }
//               >
//                 <SelectTrigger id="assignee">
//                   <SelectValue placeholder="Select Assignee" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {assigneeOptions.length > 0 ? (
//                     assigneeOptions.map((a) => {
//                       const id = String(getId(a));
//                       const label = getDisplayName(a);
//                       return (
//                         <SelectItem key={id} value={id}>
//                           {label}
//                         </SelectItem>
//                       );
//                     })
//                   ) : (
//                     <SelectItem value="__no_assignees__" disabled>
//                       No assignees available
//                     </SelectItem>
//                   )}
//                 </SelectContent>
//               </Select>
//             </div>
//           </div>

//           {/* Priority & Status */}
//           <div className="grid grid-cols-2 gap-4">
//             <div>
//               <Label htmlFor="priority">
//                 Priority <span className="text-red-500">*</span>
//               </Label>
//               <Select
//                 value={formData.priority}
//                 onValueChange={(v) =>
//                   setFormData((s) => ({ ...s, priority: v }))
//                 }
//               >
//                 <SelectTrigger id="priority">
//                   <SelectValue placeholder="Select Priority" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="Low">Low</SelectItem>
//                   <SelectItem value="Medium">Medium</SelectItem>
//                   <SelectItem value="High">High</SelectItem>
//                 </SelectContent>
//               </Select>
//             </div>

//             <div>
//               <Label htmlFor="status">
//                 Status <span className="text-red-500">*</span>
//               </Label>
//               <Select
//                 value={formData.status}
//                 onValueChange={(v) => setFormData((s) => ({ ...s, status: v }))}
//               >
//                 <SelectTrigger id="status">
//                   <SelectValue placeholder="Select Status" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   <SelectItem value="Pending">Pending</SelectItem>
//                   <SelectItem value="In Progress">In Progress</SelectItem>
//                   <SelectItem value="Completed">Completed</SelectItem>
//                 </SelectContent>
//               </Select>
//             </div>
//           </div>

//           {/* Due Date (plain date input) */}
//           <div>
//             <Label htmlFor="due">
//               Due Date <span className="text-red-500">*</span>
//             </Label>
//             <Input
//               id="due"
//               name="due"
//               type="date"
//               value={isoToDateInput(formData.due)}
//               onChange={(e) =>
//                 setFormData((s) => ({
//                   ...s,
//                   due: dateInputToIso(e.target.value),
//                 }))
//               }
//             />
//           </div>

//           {errors && <div className="text-sm text-rose-700">{errors}</div>}

//           <div className="flex justify-end gap-4 pt-4 border-t">
//             <Button
//               type="button"
//               variant="outline"
//               onClick={() => onOpenChange?.(false)}
//               disabled={submitting}
//             >
//               Close
//             </Button>
//             <Button type="submit" disabled={submitting}>
//               {submitting ? "Submitting…" : "Submit"}
//             </Button>
//           </div>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// }
  