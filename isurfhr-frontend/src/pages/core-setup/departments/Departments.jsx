// // src/pages/admin/Departments.jsx
// import React, { useEffect, useState, useMemo } from "react";
// import { Card, CardContent } from "@/components/ui/card";
// import { toast } from "sonner";
// import DepartmentsTable from "./DepartmentsTable";
// import DepartmentFormModal from "./DepartmentFormModal";
// import DepartmentsToolbar from "./DepartmentsToolbar";
// import {
//   getDepartments,
//   createDepartment,
//   updateDepartment,
//   deleteDepartment,
// } from "@/services/DepartmentService";
// import { getCompanies } from "@/services/CompanyService";
// import { useAuth } from "@/lib/context/AuthContext";

// const Departments = () => {
//   const { user } = useAuth();
//   const [departments, setDepartments] = useState([]);
//   const [companies, setCompanies] = useState([]);
//   const [companiesLoading, setCompaniesLoading] = useState(true);

//   // NEW: overall loading state for the departments page (used by DepartmentsTable)
//   const [loading, setLoading] = useState(false);

//   const [filters, setFilters] = useState({ q: "", companyId: "" });
//   const [isModalOpen, setIsModalOpen] = useState(false);
//   const [editingDepartment, setEditingDepartment] = useState(null);

//   const load = async () => {
//     try {
//       setCompaniesLoading(true);
//       setLoading(true);

//       // --- fetch companies ---
//       const compRes = await getCompanies();
//       const compData =
//         compRes?.data?.companies ?? compRes?.data?.data ?? compRes?.data ?? [];
//       const validCompanies = Array.isArray(compData)
//         ? compData.filter((c) => c && c.id != null && c.name)
//         : [];

//       // Build request params based on filters + role defaults
//       const cleanFilters = Object.fromEntries(
//         Object.entries(filters).filter(([, v]) => v != null && v !== "")
//       );

//       if ((user?.role || "").toLowerCase() === "superuser") {
//         if (!cleanFilters.companyId && validCompanies.length > 0) {
//           cleanFilters.companyId = validCompanies[0].id;
//         }
//       } else {
//         if (!cleanFilters.companyId && user?.companyId) {
//           cleanFilters.companyId = user.companyId;
//         }
//       }

//       // --- fetch departments ---
//       let depsData = [];
//       try {
//         const depsRes = await getDepartments(cleanFilters);
//         const d =
//           depsRes?.data?.departments ??
//           depsRes?.data?.data ??
//           depsRes?.data ??
//           [];
//         depsData = Array.isArray(d) ? d : [];
//       } catch (err) {
//         console.error("Failed to fetch departments:", err);
//         toast.error("Failed to load departments.");
//       }

//       setDepartments(depsData);
//       setCompanies(validCompanies);

//       // Ensure toolbar select has sensible default
//       if (!filters.companyId) {
//         if ((user?.role || "").toLowerCase() === "superuser") {
//           if (validCompanies.length > 0) {
//             setFilters((prev) => ({
//               ...prev,
//               companyId: validCompanies[0].id,
//             }));
//           }
//         } else if (user?.companyId) {
//           setFilters((prev) => ({ ...prev, companyId: user.companyId }));
//         }
//       }
//     } catch (err) {
//       console.error("Load error:", err);
//       toast.error("Failed to load data.");
//       setDepartments([]);
//       setCompanies([]);
//     } finally {
//       setCompaniesLoading(false);
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     load();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [filters, user?.role, user?.companyId]);

//   const memoizedCompanies = useMemo(() => companies, [companies]);

//   const handleCreate = async (payload) => {
//     try {
//       await createDepartment(payload);
//       toast.success("Department created");
//       load();
//     } catch (err) {
//       console.error(err);
//       toast.error("Create failed.");
//     }
//   };

//   const handleEdit = async (id, payload) => {
//     try {
//       await updateDepartment(id, payload);
//       toast.success("Department updated");
//       load();
//     } catch (err) {
//       console.error(err);
//       toast.error("Update failed.");
//     }
//   };

//   const handleDelete = async (department) => {
//     try {
//       await deleteDepartment(department.id);
//       toast.success("Department removed");
//       load();
//     } catch (err) {
//       console.error(err);
//       toast.error("Delete failed.");
//     }
//   };

//   const handleCopy = () => {
//     try {
//       const text = departments
//         .map((d) => `${d.name} (${d.code ?? ""})`)
//         .join("\n");
//       navigator.clipboard?.writeText(text);
//       toast.success("Copied department list to clipboard.");
//     } catch (err) {
//       toast.error("Copy failed.", err);
//     }
//   };

//   const handlePrint = () => {
//     window.print();
//   };

//   const handleExport = (format) => {
//     toast.success(`Triggered export (${format}).`);
//   };

//   return (
//     <div className="p-6 space-y-6">
//       <div className="flex items-center justify-between">
//         <h1 className="text-2xl font-bold">Departments</h1>
//       </div>

//       <DepartmentsToolbar
//         filters={filters}
//         onFilterChange={(newFilters) => setFilters(newFilters)}
//         companyOptions={memoizedCompanies}
//         onAddDepartment={() => {
//           setEditingDepartment(null);
//           setIsModalOpen(true);
//         }}
//         onCopy={handleCopy}
//         onPrint={handlePrint}
//         onExport={handleExport}
//       />

//       <Card>
//         <CardContent>
//           <DepartmentsTable
//             loading={loading}
//             departments={departments}
//             companyOptions={memoizedCompanies}
//             onEdit={(d) => {
//               setEditingDepartment(d);
//               setIsModalOpen(true);
//             }}
//             onDelete={handleDelete}
//             onView={(d) => console.log("View department", d)}
//           />
//         </CardContent>
//       </Card>

//       <DepartmentFormModal
//         isOpen={isModalOpen}
//         setIsOpen={setIsModalOpen}
//         department={editingDepartment}
//         onCreate={handleCreate}
//         onEdit={handleEdit}
//         companyOptions={memoizedCompanies}
//         companiesLoading={companiesLoading}
//       />
//     </div>
//   );
// };

// export default Departments;
