// src/services/TaxFilingService.js
import axios from 'axios';

// Separate axios instance for Tax Filing (part of Payroll Engine)
const TAX_API = axios.create({
	baseURL: import.meta.env.VITE_ENGINE_URL || 'http://localhost:3000/api/engine',
	headers: {
		'Content-Type': 'application/json',
	},
});

// Add auth token to requests
TAX_API.interceptors.request.use(
	(config) => {
		const token = localStorage.getItem('authToken');
		if (token) {
			config.headers = config.headers || {};
			config.headers.Authorization = `Bearer ${token}`;
		}
		return config;
	},
	(error) => Promise.reject(error)
);

// Response error handler
TAX_API.interceptors.response.use(
	(res) => {
		const contentType = res.headers?.['content-type'];
		if (contentType && !contentType.includes('application/json')) {
			console.warn('[TAX_API] Non-JSON response received:', contentType);
		}
		return res;
	},
	(err) => {
		if (err.response) {
			console.warn('[TAX_API] Error:', err.response.status, err.response.config?.url);
		}
		return Promise.reject(err);
	}
);

// ============================================
// DASHBOARD
// ============================================

/**
 * Get tax filing dashboard overview
 * @param {string} companyId - Company ID (optional for HR role)
 */
export const getTaxFilingDashboard = (companyId) => {
	return TAX_API.get('/tax-filing/dashboard', { params: { companyId } });
};

// ============================================
// TAX PROFILES
// ============================================

/**
 * Get all tax profiles with pagination and filtering
 * @param {Object} params - { companyId, page, limit, state, search, missingProfiles }
 */
export const getTaxProfiles = (params = {}) => {
	return TAX_API.get('/tax-filing/profiles', { params });
};

/**
 * Get staff list for dropdown selection (with tax profile status)
 * @param {Object} params - { companyId, withoutProfile, search, limit }
 */
export const getStaffForDropdown = (params = {}) => {
	return TAX_API.get('/tax-filing/profiles/staff-lookup', {
		params: {
			withoutProfile: params.withoutProfile ?? true,
			search: params.search,
			limit: params.limit ?? 500,
			companyId: params.companyId,
		},
	});
};

/**
 * Get single tax profile by staff ID
 * @param {string} staffId - Staff record ID
 * @param {string} companyId - Company ID
 */
export const getTaxProfileByStaffId = (staffId, companyId) => {
	return TAX_API.get(`/tax-filing/profiles/${staffId}`, { params: { companyId } });
};

/**
 * Create new tax profile
 * @param {Object} payload - { staffId, stateOfResidence, jtbTin?, pfaName?, companyId }
 */
export const createTaxProfile = (payload) => {
	return TAX_API.post('/tax-filing/profiles', payload);
};

/**
 * Update tax profile
 * @param {string} staffId - Staff record ID
 * @param {Object} payload - { stateOfResidence?, jtbTin?, pfaName?, tinVerified?, companyId }
 */
export const updateTaxProfile = (staffId, payload) => {
	return TAX_API.put(`/tax-filing/profiles/${staffId}`, payload);
};

/**
 * Delete tax profile
 * @param {string} staffId - Staff record ID
 * @param {string} companyId - Company ID
 */
export const deleteTaxProfile = (staffId, companyId) => {
	return TAX_API.delete(`/tax-filing/profiles/${staffId}`, { params: { companyId } });
};

/**
 * Download import template
 * @param {string} companyId - Company ID
 */
export const downloadProfileTemplate = (companyId) => {
	return TAX_API.get('/tax-filing/profiles/template', {
		params: { companyId },
		responseType: 'blob',
	});
};

/**
 * Bulk import tax profiles
 * @param {File} file - Excel/CSV file
 * @param {string} companyId - Company ID
 */
export const bulkImportProfiles = (file, companyId) => {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('companyId', companyId);
	return TAX_API.post('/tax-filing/profiles/upload', formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	});
};

/**
 * Check lock status for year
 * @param {string} companyId - Company ID
 */
export const getLockStatus = (companyId) => {
	return TAX_API.get('/tax-filing/profiles/lock-states', { params: { companyId } });
};

/**
 * Lock states for year (January 1st rule)
 * @param {Object} payload - { year, companyId }
 */
export const lockStatesForYear = (payload) => {
	return TAX_API.post('/tax-filing/profiles/lock-states', payload);
};

// ============================================
// MONTHLY FILING
// ============================================

/**
 * Get monthly filing summary for a period
 * @param {string} periodId - Pay period ID
 * @param {string} companyId - Company ID
 */
export const getMonthlyFilingSummary = (periodId, companyId) => {
	return TAX_API.get(`/tax-filing/monthly/${periodId}`, { params: { companyId } });
};

/**
 * Generate monthly PAYE schedules
 * @param {string} periodId - Pay period ID
 * @param {string} companyId - Company ID
 */
export const generateMonthlySchedules = (periodId, companyId) => {
	return TAX_API.post(`/tax-filing/monthly/${periodId}`, { companyId });
};

/**
 * Get state schedule details
 * @param {string} periodId - Pay period ID
 * @param {string} stateCode - State code (e.g., "LA")
 * @param {string} companyId - Company ID
 */
export const getStateScheduleDetails = (periodId, stateCode, companyId) => {
	return TAX_API.get(`/tax-filing/monthly/${periodId}/${stateCode}`, { params: { companyId } });
};

/**
 * Download state schedule
 * @param {string} periodId - Pay period ID
 * @param {string} stateCode - State code
 * @param {string} format - 'xlsx' or 'csv'
 * @param {string} companyId - Company ID
 */
export const downloadStateSchedule = (periodId, stateCode, format, companyId) => {
	return TAX_API.get(`/tax-filing/monthly/${periodId}/${stateCode}/download`, {
		params: { format, companyId },
		responseType: 'blob',
	});
};

/**
 * Mark schedule as filed
 * @param {string} periodId - Pay period ID
 * @param {string} stateCode - State code
 * @param {Object} payload - { paymentReference?, companyId }
 */
export const markScheduleAsFiled = (periodId, stateCode, payload) => {
	return TAX_API.put(`/tax-filing/monthly/${periodId}/${stateCode}`, payload);
};

// ============================================
// ANNUAL RETURNS (FORM H1)
// ============================================

/**
 * Get annual filing summary for a year
 * @param {number} year - Tax year
 * @param {string} companyId - Company ID
 */
export const getAnnualFilingSummary = (year, companyId) => {
	return TAX_API.get(`/tax-filing/annual/${year}`, { params: { companyId } });
};

/**
 * Generate annual returns (Form H1)
 * @param {number} year - Tax year
 * @param {string} companyId - Company ID
 */
export const generateAnnualReturns = (year, companyId) => {
	return TAX_API.post(`/tax-filing/annual/${year}`, { companyId });
};

/**
 * Get state annual return (Form H1 data)
 * @param {number} year - Tax year
 * @param {string} stateCode - State code
 * @param {string} companyId - Company ID
 */
export const getStateAnnualReturn = (year, stateCode, companyId) => {
	return TAX_API.get(`/tax-filing/annual/${year}/${stateCode}`, { params: { companyId } });
};

/**
 * Download Form H1
 * @param {number} year - Tax year
 * @param {string} stateCode - State code
 * @param {string} format - 'xlsx' or 'csv'
 * @param {string} companyId - Company ID
 */
export const downloadFormH1 = (year, stateCode, format, companyId) => {
	return TAX_API.get(`/tax-filing/annual/${year}/${stateCode}/download`, {
		params: { format, companyId },
		responseType: 'blob',
	});
};

/**
 * Mark annual return as filed
 * @param {number} year - Tax year
 * @param {string} stateCode - State code
 * @param {string} companyId - Company ID
 */
export const markAnnualReturnAsFiled = (year, stateCode, companyId) => {
	return TAX_API.put(`/tax-filing/annual/${year}/${stateCode}`, { companyId });
};

// ============================================
// TAX CERTIFICATES
// ============================================

/**
 * List employees eligible for tax certificates
 * @param {number} year - Tax year
 * @param {string} companyId - Company ID
 */
export const getEligibleEmployees = (year, companyId) => {
	return TAX_API.post(`/tax-filing/annual/tax-certificates/${year}`, { companyId });
};

/**
 * Download employee tax certificate
 * @param {number} year - Tax year
 * @param {string} staffId - Staff record ID
 * @param {string} companyId - Company ID
 */
export const downloadTaxCertificate = (year, staffId, companyId) => {
	return TAX_API.get(`/tax-filing/annual/tax-certificates/${year}`, {
		params: { staffId, companyId },
		responseType: 'blob',
	});
};

// ============================================
// STATES
// ============================================

/**
 * Get states with employee counts
 * @param {string} companyId - Company ID
 * @param {boolean} includeEmpty - Include states with 0 employees
 */
export const getStatesWithCounts = (companyId, includeEmpty = false) => {
	return TAX_API.get('/tax-filing/states', { params: { companyId, includeEmpty } });
};

// ============================================
// NIGERIA STATES REFERENCE
// ============================================

export const NIGERIA_STATES = [
	{ code: 'AB', name: 'Abia', irsName: 'ABIRS', zone: 'South East' },
	{ code: 'AD', name: 'Adamawa', irsName: 'ADIRS', zone: 'North East' },
	{ code: 'AK', name: 'Akwa Ibom', irsName: 'AKIRS', zone: 'South South' },
	{ code: 'AN', name: 'Anambra', irsName: 'ANIRS', zone: 'South East' },
	{ code: 'BA', name: 'Bauchi', irsName: 'BAIRS', zone: 'North East' },
	{ code: 'BY', name: 'Bayelsa', irsName: 'BYIRS', zone: 'South South' },
	{ code: 'BE', name: 'Benue', irsName: 'BEIRS', zone: 'North Central' },
	{ code: 'BO', name: 'Borno', irsName: 'BOIRS', zone: 'North East' },
	{ code: 'CR', name: 'Cross River', irsName: 'CRIRS', zone: 'South South' },
	{ code: 'DE', name: 'Delta', irsName: 'DEIRS', zone: 'South South' },
	{ code: 'EB', name: 'Ebonyi', irsName: 'EBIRS', zone: 'South East' },
	{ code: 'ED', name: 'Edo', irsName: 'EDIRS', zone: 'South South' },
	{ code: 'EK', name: 'Ekiti', irsName: 'EKIRS', zone: 'South West' },
	{ code: 'EN', name: 'Enugu', irsName: 'ENIRS', zone: 'South East' },
	{ code: 'FC', name: 'FCT', irsName: 'FCT-IRS', zone: 'North Central' },
	{ code: 'GO', name: 'Gombe', irsName: 'GOIRS', zone: 'North East' },
	{ code: 'IM', name: 'Imo', irsName: 'IMIRS', zone: 'South East' },
	{ code: 'JI', name: 'Jigawa', irsName: 'JIIRS', zone: 'North West' },
	{ code: 'KD', name: 'Kaduna', irsName: 'KDIRS', zone: 'North West' },
	{ code: 'KN', name: 'Kano', irsName: 'KNIRS', zone: 'North West' },
	{ code: 'KT', name: 'Katsina', irsName: 'KTIRS', zone: 'North West' },
	{ code: 'KE', name: 'Kebbi', irsName: 'KEIRS', zone: 'North West' },
	{ code: 'KO', name: 'Kogi', irsName: 'KOIRS', zone: 'North Central' },
	{ code: 'KW', name: 'Kwara', irsName: 'KWIRS', zone: 'North Central' },
	{ code: 'LA', name: 'Lagos', irsName: 'LIRS', zone: 'South West' },
	{ code: 'NA', name: 'Nasarawa', irsName: 'NAIRS', zone: 'North Central' },
	{ code: 'NI', name: 'Niger', irsName: 'NIIRS', zone: 'North Central' },
	{ code: 'OG', name: 'Ogun', irsName: 'OGIRS', zone: 'South West' },
	{ code: 'ON', name: 'Ondo', irsName: 'ONIRS', zone: 'South West' },
	{ code: 'OS', name: 'Osun', irsName: 'OSIRS', zone: 'South West' },
	{ code: 'OY', name: 'Oyo', irsName: 'OYIRS', zone: 'South West' },
	{ code: 'PL', name: 'Plateau', irsName: 'PLIRS', zone: 'North Central' },
	{ code: 'RI', name: 'Rivers', irsName: 'RIRS', zone: 'South South' },
	{ code: 'SO', name: 'Sokoto', irsName: 'SOIRS', zone: 'North West' },
	{ code: 'TA', name: 'Taraba', irsName: 'TAIRS', zone: 'North East' },
	{ code: 'YO', name: 'Yobe', irsName: 'YOIRS', zone: 'North East' },
	{ code: 'ZA', name: 'Zamfara', irsName: 'ZAIRS', zone: 'North West' },
];

// Filing status options
export const FILING_STATUS = {
	PENDING: 'PENDING',
	GENERATED: 'GENERATED',
	FILED: 'FILED',
	CONFIRMED: 'CONFIRMED',
};

// Helper to get state by code
export const getStateByCode = (code) => NIGERIA_STATES.find((s) => s.code === code);

// Helper to get state by name
export const getStateByName = (name) => NIGERIA_STATES.find((s) => s.name === name);
