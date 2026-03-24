const API_BASE_URL = "http://localhost:3000/api/v1";

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

// ─── Employee APIs ───
export const employeeApi = {
  getAll: () => request("/employees"),

  search: (query) => request(`/employees/search?q=${encodeURIComponent(query)}`),

  getById: (id) => request(`/employees/${id}`),

  getActive: () => request("/employees?status=active"),
};

// ─── Offboarding APIs ───
export const offboardingApi = {
  getAll: () => request("/offboarding"),

  getById: (id) => request(`/offboarding/${id}`),

  create: (payload) =>
    request("/offboarding", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id, payload) =>
    request(`/offboarding/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  updateTask: (caseId, taskId, payload) =>
    request(`/offboarding/${caseId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getStats: () => request("/offboarding/stats"),

  getTimeline: (id) => request(`/offboarding/${id}/timeline`),
};

// ─── Admin APIs ───
export const adminApi = {
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/admin/audit-logs${query ? `?${query}` : ""}`);
  },

  getPolicies: () => request("/admin/policies"),

  createPolicy: (payload) =>
    request("/admin/policies", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updatePolicy: (id, payload) =>
    request(`/admin/policies/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  getTemplates: () => request("/admin/templates"),

  createTemplate: (payload) =>
    request("/admin/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTemplate: (id, payload) =>
    request(`/admin/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteTemplate: (id) =>
    request(`/admin/templates/${id}`, { method: "DELETE" }),

  getSettings: () => request("/admin/settings"),

  updateSettings: (payload) =>
    request("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

// ─── Employee Self-Service APIs ───
export const employeeSelfApi = {
  getMyProfile: () => request("/me/profile"),

  getMyOffboarding: () => request("/me/offboarding"),

  getMyTasks: () => request("/me/tasks"),

  updateTaskStatus: (taskId, status) =>
    request(`/me/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getMyDocuments: () => request("/me/documents"),

  uploadDocument: (formData) =>
    request("/me/documents/upload", {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set content-type for FormData
    }),

  getFaqs: () => request("/faqs/offboarding"),
};
