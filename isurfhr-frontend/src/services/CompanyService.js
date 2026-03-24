// src/services/CompaniesService.js
import API from './axios'; // your existing axios wrapper

// export const getCompanies = (params = {}) => {
// 	// params: { q, sector, parentId, page, limit }
// 	return API.get('/company', {
// 		params,
// 		validateStatus: (status) => {
// 			return status === 200 || status === 404;
// 		},
// 	});
// };

// export const getCompany = (id) => API.get(`/company/${id}`);

// export const updateCompany = (id, payload) => API.put(`/company/${id}`, payload);

// export const deleteCompany = (id) => API.delete(`/company/${id}`);

/**
 * Fetches all companies is allowed to assign within the system.
 *
 * @returns {Promise<AxiosResponse>}
 * GET /companies/accessible
 */
export const getAccessibleCompany = () => API.get('/companies/accessible');

/**
 * Retrieves all company-to-user assignment records.
 *
 * @returns {Promise<AxiosResponse>}
 * GET /admin/company-assignments/view
 */
export const getAssignment = () => API.get('/admin/company-assignments/view');

/**
 * Removes (revokes) a company assignment from a specific user.
 *
 * @param {string} userId - The ID of the user whose assignment is being removed
 * @param {string} companyId - The ID of the company to unassign
 *
 * @returns {Promise<AxiosResponse>}
 * DELETE /admin/assign-company
 */
export const removeCompanyAssignment = (userId, companyId) => API.delete(`/admin/assign-company?userId=${userId}&companyId=${companyId}`);

/**
 * Assigns one company to a staff member.
 *
 * @param {Object} payload
 * @param {string} payload.userId - ID of the staff user
 * @param {string} payload.role - Role of the staff member (e.g., ADMIN, STAFF)
 * @param {string|string[]} payload.companyId - Company ID or list of company IDs
 *
 * @returns {Promise<AxiosResponse>}
 * POST /admin/assign-company
 *
 * @example
 * const payload = {
 *   userId: selectedStaff.id,
 *   role: selectedStaff.role,
 *   companyId: 'company-id'
 * };
 */
export const assignCompaniesToStaff = (payload) => API.post('/admin/assign-company', payload);

/**
 * Registers a new company in the system.
 *
 * @param {Object} payload
 * @param {string} payload.companyName - Legal or business name of the company
 * @param {string} payload.email - Primary contact email
 * @param {string} payload.phone - Primary contact phone number
 * @param {string} payload.address - Physical or mailing address
 * @param {string} payload.taxId - Tax identification number
 * @param {string} payload.logo - Base64 encoded company logo (optional)
 *
 * @returns {Promise<AxiosResponse>}
 * POST /auth/companies/register
 *
 * @example
 * const payload = {
 *   companyName: form.companyName,
 *   email: form.email,
 *   phone: form.phone,
 *   address: form.address,
 *   taxId: form.taxId,
 *   logo: '' // base64 string
 * };
 */
export const registerCompany = (payload) => API.post('/auth/companies/register', payload);
