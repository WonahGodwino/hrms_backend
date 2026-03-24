// src/services/TaskService.js
import API from "./axios"; // your existing axios wrapper

/**
 * TaskService
 * - Mirrors DepartmentService but targets task endpoints.
 * - getTasks accepts params: { q, page, limit, ... }
 */

export const getTasks = (params = {}) => {
  // params: { q, page, limit, ... }
  return API.get("/task", { params });
};

export const getTask = (id) => API.get(`/task/${id}`);

export const createTask = (payload) => API.post("/task", payload);

export const updateTask = (id, payload) => API.put(`/task/${id}`, payload);

export const deleteTask = (id) => API.delete(`/task/${id}`);

export const getTaskStatistics = () => API.get("/task/statistics");
