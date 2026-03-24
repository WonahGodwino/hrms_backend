// // src/pages/admin/BusinessUnits.jsx
// import React, { useEffect, useState } from "react";
// import { Card, CardContent } from "@/components/ui/card";
// import { toast } from "sonner";
// import BusinessUnitsTable from "./BusinessUnitsTable";
// import BusinessUnitFormModal from "./BusinessUnitFormModal";
// import BusinessUnitsToolbar from "./BusinessUnitsToolbar";
// import {
//   getBusinessUnits,
//   createBusinessUnit,
//   updateBusinessUnit,
//   deleteBusinessUnit,
// } from "@/services/BusinessUnitService";
// import { getDepartments } from "@/services/DepartmentService";
// import { getCompanies } from "@/services/CompanyService";
// import { useAuth } from "@/lib/context/AuthContext";

// const BusinessUnits = () => {
//   const { user } = useAuth();
//   const [businessUnits, setBusinessUnits] = useState([]);
//   const [departments, setDepartments] = useState([]);
//   const [companies, setCompanies] = useState([]);
//   const [filters, setFilters] = useState({
//     q: "",
//     departmentId: "",
//     companyId: "",
//   });
//   const [isModalOpen, setIsModalOpen] = useState(false);
//   const [editingUnit, setEditingUnit] = useState(null);

//   const [loading, setLoading] = useState(false);
//   const [companiesLoading, setCompaniesLoading] = useState(true);

//   const load = async () => {
//     try {
//       setLoading(true);
//       setCompaniesLoading(true);

//       const cleanFilters = Object.fromEntries(
//         Object.entries(filters).filter(([, v]) => v !== "" && v != null)
//       );

//       const compsRes = await getCompanies();
//       const compData =
//         compsRes?.data?.companies ??
//         compsRes?.data?.data ??
//         compsRes?.data ??
//         [];
//       const validCompanies = Array.isArray(compData)
//         ? compData.filter((c) => c && c.id != null && c.name)
//         : [];

//       if ((user?.role || "").toLowerCase() === "superuser") {
//         if (!cleanFilters.companyId && validCompanies.length > 0) {
//           cleanFilters.companyId = validCompanies[0].id;
//         }
//       } else {
//         if (!cleanFilters.companyId && user?.companyId) {
//           cleanFilters.companyId = user.companyId;
//         }
//       }

//       const [unitsRes, depsRes] = await Promise.allSettled([
//         getBusinessUnits(cleanFilters),
//         getDepartments(
//           cleanFilters.companyId ? { companyId: cleanFilters.companyId } : {}
//         ),
//       ]);

//       let unitsData = [];
//       if (unitsRes.status === "fulfilled") {
//         const u =
//           unitsRes.value?.data?.businessUnits ??
//           unitsRes.value?.data ??
//           unitsRes.value ??
//           [];
//         unitsData = Array.isArray(u) ? u : [];
//       } else {
//         console.error("Failed to fetch business units:", unitsRes.reason);
//         toast.error("Failed to load business units.");
//       }

//       let depsData = [];
//       if (depsRes.status === "fulfilled") {
//         const d =
//           depsRes.value?.data?.departments ??
//           depsRes.value?.data ??
//           depsRes.value ??
//           [];
//         depsData = Array.isArray(d) ? d : [];
//       } else {
//         console.error("Failed to fetch departments:", depsRes.reason);
//       }

//       setBusinessUnits(unitsData);
//       setDepartments(depsData);
//       setCompanies(validCompanies);

//       if (!filters.companyId) {
//         if ((user?.role || "").toLowerCase() === "superuser") {
//           if (validCompanies.length > 0) {
//             setFilters((prev) => ({
//               ...prev,
//               companyId: validCompanies[0].id,
//               departmentId: "",
//             }));
//           }
//         } else if (user?.companyId) {
//           setFilters((prev) => ({ ...prev, companyId: user.companyId }));
//         }
//       } else {
//         if (filters.departmentId) {
//           const found = depsData.some(
//             (d) => String(d.id) === String(filters.departmentId)
//           );
//           if (!found) {
//             setFilters((prev) => ({ ...prev, departmentId: "" }));
//           }
//         }
//       }
//     } catch (err) {
//       console.error("Load error:", err);
//       toast.error("Failed to load data. Using local fallback.");
//       setBusinessUnits([]);
//       setDepartments([]);
//       setCompanies([]);
//     } finally {
//       setLoading(false);
//       setCompaniesLoading(false);
//     }
//   };

//   useEffect(() => {
//     load();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [filters, user?.role, user?.companyId]);

//   const handleCreate = async (payload) => {
//     try {
//       const res = await createBusinessUnit(payload);
//       const created = res?.data ?? { id: Date.now(), ...payload };
//       setBusinessUnits((p) => [created, ...p]);
//       toast.success("Business unit created");
//     } catch (err) {
//       console.error(err);
//       toast.error("Create failed, adding locally.");
//       setBusinessUnits((p) => [{ id: Date.now(), ...payload }, ...p]);
//     }
//   };

//   const handleEdit = async (id, payload) => {
//     try {
//       const res = await updateBusinessUnit(id, payload);
//       const updated = res?.data ?? { id, ...payload };
//       setBusinessUnits((p) => p.map((u) => (u.id === id ? updated : u)));
//       toast.success("Business unit updated");
//     } catch (err) {
//       console.error(err);
//       toast.error("Update failed, updating locally");
//       setBusinessUnits((p) =>
//         p.map((u) => (u.id === id ? { ...u, ...payload } : u))
//       );
//     }
//   };

//   const handleDelete = async (unit) => {
//     if (!unit?.id) {
//       setBusinessUnits((p) => p.filter((u) => u !== unit));
//       return;
//     }
//     try {
//       await deleteBusinessUnit(unit.id);
//       setBusinessUnits((p) => p.filter((u) => u.id !== unit.id));
//       toast.success("Business unit removed");
//     } catch (err) {
//       console.error(err);
//       toast.error("Delete failed on server, removed locally.");
//       setBusinessUnits((p) => p.filter((u) => u.id !== unit.id));
//     }
//   };

//   const handleCopy = () => {
//     try {
//       const text = businessUnits.map((u) => u.name).join("\n");
//       navigator.clipboard?.writeText(text);
//       toast.success("Copied business unit names to clipboard.");
//     } catch (err) {
//       console.warn("Copy failed", err);
//       toast.error("Copy failed.");
//     }
//   };

//   const handlePrint = () => {
//     window.print();
//   };

//   const handleExport = (format) => {
//     console.log("Export business units", format, { filters, businessUnits });
//     toast.success(`Triggered export (${format}).`);
//   };

//   const departmentOptions = Array.isArray(departments) ? departments : [];

//   return (
//     <div className="p-6 space-y-6">
//       <div className="flex items-center justify-between">
//         <h1 className="text-2xl font-bold">Business Units</h1>
//       </div>

//       <BusinessUnitsToolbar
//         filters={filters}
//         onFilterChange={(newFilters) => setFilters(newFilters)}
//         departmentOptions={departmentOptions}
//         companyOptions={companies}
//         onAddBusinessUnit={() => {
//           setEditingUnit(null);
//           setIsModalOpen(true);
//         }}
//         onCopy={handleCopy}
//         onPrint={handlePrint}
//         onExport={handleExport}
//       />

//       <Card>
//         <CardContent>
//           <BusinessUnitsTable
//             loading={loading}
//             businessUnits={businessUnits}
//             onEdit={(u) => {
//               setEditingUnit(u);
//               setIsModalOpen(true);
//             }}
//             onDelete={handleDelete}
//             onView={(u) => console.log("View business unit", u)}
//           />
//         </CardContent>
//       </Card>

//       <BusinessUnitFormModal
//         isOpen={isModalOpen}
//         setIsOpen={setIsModalOpen}
//         businessUnit={editingUnit}
//         onCreate={handleCreate}
//         onEdit={handleEdit}
//         // 🔑 Pass all companies
//         companyOptions={companies}
//         // 🔑 Always pass all departments, filtering will be handled inside the modal based on selected company
//         departmentOptions={departments}
//       />
//     </div>
//   );
// };

// export default BusinessUnits;
