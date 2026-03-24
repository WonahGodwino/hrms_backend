// src/services/DepartmentService.js
import API from "./axios"; // your existing axios wrapper

/**
 * DepartmentService
 * - Mirrors CompaniesService but targets department endpoints.
 * - getDepartments accepts params: { q, companyId, page, limit, ... }
 */

export const getDepartments = (params = {}) => {
  // params: { q, companyId, page, limit, ... }
  return API.get("/admin/department", { params });
};

export const getDepartment = (id) => API.get(`/admin/department/${id}`);

export const createDepartment = (payload) =>
  API.post("/admin/department", payload);

export const updateDepartment = (id, payload) =>
  API.put(`/admin/department/${id}`, payload);

export const deleteDepartment = (id) => API.delete(`/admin/department/${id}`);
