// src/services/RecruitmentService.js
import API from "./axios";

/**
 * Create a new job posting
 * Endpoint: POST /api/jobs/create
 * Auth: HR | SUPER_ADMIN
 */
export const createJob = (payload) =>
  API.post("/recruitment/jobs/create", payload);

/**
 * Bulk Upload Jobs
 * Endpoint: POST /api/recruitment/jobs/upload
 * Auth: HR | SUPER_ADMIN
 * @param {File} file - CSV or XLSX file containing job details
 */
export const bulkUploadJobs = (file) => {
  const formData = new FormData();
  formData.append("file", file);

  return API.post("/recruitment/jobs/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/**
 * Download Job Upload Template
 * Endpoint: GET /api/jobs/template
 * Helper function typically required for the bulk upload workflow
 */
export const downloadJobTemplate = () => {
  return API.get("/jobs/template", {
    responseType: "blob",
  });
};

/**
 * Fetch Applicants
 * Endpoint: GET /api/recruitment/applicants
 * Auth: HR | SUPER_ADMIN
 * @param {Object} params - Query parameters (e.g. { jobId: '...' })
 */
export const getApplicants = (params = {}) => {
  return API.get("/recruitment/applicants", { params });
};

/**
 * Fetch Job Postings (Admin View)
 * Endpoint: GET /api/recruitment/jobs/view
 * Auth: HR | SUPER_ADMIN
 * @param {Object} params - Query parameters (e.g. { status: 'Open', page: 1 })
 */
export const getJobs = (params = {}) => {
  return API.get("/recruitment/jobs/view", { params });
};

/**
 * Fetch Public Job Postings
 * Endpoint: GET /api/recruitment/jobs/public/view
 * Auth: Public
 * @param {Object} params - Query parameters (e.g. { page: 1, search: '...', location: '...' })
 */
export const getPublicJobs = (params = {}) => {
  return API.get("/recruitment/jobs/public/view", { params });
};

/**
 * Apply for a Job (Public)
 * Endpoint: POST /api/recruitment/jobs/apply
 * Auth: Public
 * @param {Object} applicationData - { jobId, applicantName, email, resume: File/Blob, ... }
 *
 * Submits a job application with a resume file.
 * Requires multipart/form-data to handle the binary CV upload.
 */
export const applyForJob = async (formDataPayload) => {
  // CRITICAL: Do NOT use JSON.stringify() or wrap formDataPayload in {}.
  // Let Axios automatically detect the FormData and set the correct boundary.
  return await API.post("/recruitment/jobs/public/apply", formDataPayload, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

/**
 * Get Selection/Ranking Results
 * Endpoint: GET /api/recruitment/selection
 * Auth: HR | SUPER_ADMIN
 * @param {Object} params - Query parameters (e.g. { jobId: '...' })
 */
export const getSelectionResults = (params = {}) => {
  return API.get("/recruitment/selection", { params });
};

/**
 * Download Company Assignment Report
 * Endpoint: GET /api/admin/company-assignments/report/
 * Auth: ADMIN | SUPER_ADMIN
 * * Retrieves the overall assignment report as a downloadable file (e.g., CSV/XLSX).
 */
export const downloadCompanyAssignmentReport = () => {
  return API.get("/admin/company-assignments/report/", {
    responseType: "blob", // Important for properly receiving binary file data
  });
};

/**
 * View Applicant CV (Inline)
 * Endpoint: GET /api/recruitment/applicants/:applicationId/cv?disposition=inline
 * Auth: HR | ADMIN | SUPER_ADMIN
 * @param {string|number} applicationId - The ID of the Application
 */
export const viewApplicantCV = (applicationId) => {
  return API.get(
    `/recruitment/applicants/${applicationId}/cv?disposition=inline`,
    {
      responseType: "blob",
    },
  );
};

/**
 * Download Applicant CV (Attachment)
 * Endpoint: GET /api/recruitment/applicants/:applicationId/cv?disposition=attachment
 * Auth: HR | ADMIN | SUPER_ADMIN
 * @param {string|number} applicationId - The ID of the Application
 */
export const downloadApplicantCV = (applicationId) => {
  return API.get(
    `/recruitment/applicants/${applicationId}/cv?disposition=attachment`,
    {
      responseType: "blob",
    },
  );
};
