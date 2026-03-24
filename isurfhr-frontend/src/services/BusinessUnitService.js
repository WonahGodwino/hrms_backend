// src/services/BusinessUnitService.js
import API from "./axios"; // your existing axios wrapper

/**
 * BusinessUnitService
 * - Mirrors DepartmentService but targets business unit endpoints.
 * - getBusinessUnits accepts params: { q, departmentId, page, limit, ... }
 */

export const getBusinessUnits = (params = {}) => {
  // params: { q, departmentId, page, limit, ... }
  return API.get("/admin/business-unit", { params });
};

export const getBusinessUnit = (id) => API.get(`/admin/business-unit/${id}`);

export const createBusinessUnit = (payload) =>
  API.post("/admin/business-unit", payload);

export const updateBusinessUnit = (id, payload) =>
  API.put(`/admin/business-unit/${id}`, payload);

export const deleteBusinessUnit = (id) => API.delete(`/admin/business-unit/${id}`);
