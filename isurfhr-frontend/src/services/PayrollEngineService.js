// src/services/PayrollEngineService.js
import axios from 'axios';

// Separate axios instance for Payroll Engine
const ENGINE_API = axios.create({
	baseURL: import.meta.env.VITE_ENGINE_URL || 'http://localhost:3000/api/engine',
	headers: {
		'Content-Type': 'application/json',
	},
});

// Add auth token to requests
ENGINE_API.interceptors.request.use(
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
ENGINE_API.interceptors.response.use(
	(res) => {
		// Check for non-JSON responses (likely 404 HTML page)
		const contentType = res.headers?.['content-type'];
		if (contentType && !contentType.includes('application/json')) {
			console.warn('[ENGINE_API] Non-JSON response received:', contentType);
		}
		return res;
	},
	(err) => {
		if (err.response) {
			console.warn('[ENGINE_API] Error:', err.response.status, err.response.config?.url);
		}
		return Promise.reject(err);
	}
);

// ============================================
// PAY PERIODS
// ============================================

/**
 * Create a new pay period
 * @param {Object} payload - { name, startDate, endDate, paymentDate }
 */
export const createPayPeriod = (payload) => {
	return ENGINE_API.post('/pay-periods', payload);
};

/**
 * Get all pay periods with pagination and filtering
 * @param {Object} params - { page, limit, year, status }
 */
export const getPayPeriods = (params = {}) => {
	return ENGINE_API.get('/pay-periods', { params });
};

/**
 * Get current active (non-paid) pay period
 */
export const getCurrentPayPeriod = () => {
	return ENGINE_API.get('/pay-periods/current');
};

/**
 * Get pay period by ID
 * @param {string} id - Pay period ID
 */
export const getPayPeriodById = (id) => {
	return ENGINE_API.get(`/pay-periods/${id}`);
};

/**
 * Update pay period (PATCH)
 * @param {string} id - Pay period ID
 * @param {Object} payload - Fields to update
 */
export const updatePayPeriod = (id, payload) => {
	return ENGINE_API.patch(`/pay-periods/${id}`, payload);
};

/**
 * Open validation window for a pay period
 * @param {string} id - Pay period ID
 */
export const openValidation = (id) => {
	return ENGINE_API.post(`/pay-periods/${id}/open-validation`);
};

/**
 * Close validation window for a pay period
 * @param {string} id - Pay period ID
 */
export const closeValidation = (id) => {
	return ENGINE_API.post(`/pay-periods/${id}/close-validation`);
};

/**
 * Compute payroll for a pay period
 * @param {string} id - Pay period ID
 */
export const computePayroll = (id) => {
	return ENGINE_API.post(`/pay-periods/${id}/compute`);
};

/**
 * Approve payroll for payment
 * @param {string} id - Pay period ID
 */
export const approvePayroll = (id) => {
	return ENGINE_API.post(`/pay-periods/${id}/approve`);
};

/**
 * Get payroll computation summary for a pay period
 * @param {string} id - Pay period ID
 */
export const getPayrollSummary = (id) => {
	return ENGINE_API.get(`/pay-periods/${id}/summary`);
};

/**
 * Mark payroll as paid (finalizes the payroll period)
 * @param {string} id - Pay period ID
 */
export const markPayrollAsPaid = (id) => {
	return ENGINE_API.post(`/pay-periods/${id}/mark-paid`);
};

// ============================================
// STAFF MANAGEMENT
// ============================================

/**
 * Get all staff with salary status
 * @param {Object} params - { page, limit, search, department, includeInactive }
 */
export const getStaff = (params = {}) => {
	return ENGINE_API.get('/staff', { params });
};

/**
 * Get single staff by ID
 * @param {string} id - Staff ID
 */
export const getStaffById = (id) => {
	return ENGINE_API.get(`/staff/${id}`);
};

/**
 * Create new staff record
 * @param {Object} payload - { staffId, email, firstName, lastName, department, position, phone, bankName, accountNumber, bvn }
 */
export const createStaff = (payload) => {
	return ENGINE_API.post('/staff', payload);
};

/**
 * Update staff record
 * @param {string} id - Staff ID
 * @param {Object} payload - Fields to update
 */
export const updateStaff = (id, payload) => {
	return ENGINE_API.put(`/staff/${id}`, payload);
};

/**
 * Deactivate staff (soft delete)
 * @param {string} id - Staff ID
 */
export const deactivateStaff = (id) => {
	return ENGINE_API.delete(`/staff/${id}`);
};

// ============================================
// EMPLOYEE SALARIES
// ============================================

/**
 * Create a new salary structure
 * @param {Object} payload - { staffId, basicSalary, housingAllowance, transportAllowance, otherAllowances, effectiveDate }
 */
export const createSalaryStructure = (payload) => {
	return ENGINE_API.post('/employee-salaries', payload);
};

/**
 * Get all salary structures with pagination
 * @param {Object} params - { page, limit, isActive, employeeCategory }
 */
export const getSalaryStructures = (params = {}) => {
	return ENGINE_API.get('/employee-salaries', { params });
};

/**
 * Get salary structure by staff ID
 * @param {string} staffId - Staff ID
 */
export const getSalaryByStaffId = (staffId) => {
	return ENGINE_API.get(`/employee-salaries/${staffId}`);
};

/**
 * Update salary structure
 * @param {string} staffId - Staff ID
 * @param {Object} payload - Fields to update
 */
export const updateSalaryStructure = (staffId, payload) => {
	return ENGINE_API.put(`/employee-salaries/${staffId}`, payload);
};

/**
 * Deactivate (soft delete) salary structure
 * @param {string} staffId - Staff ID
 */
export const deactivateSalary = (staffId) => {
	return ENGINE_API.delete(`/employee-salaries/${staffId}`);
};

/**
 * Bulk import salary structures
 * @param {Array|File} salariesOrFile - Array of salary objects or File for upload
 */
export const bulkImportSalaries = (salariesOrFile) => {
	if (salariesOrFile instanceof File) {
		const formData = new FormData();
		formData.append('file', salariesOrFile);
		return ENGINE_API.post('/employee-salaries/import', formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
		});
	}
	return ENGINE_API.post('/employee-salaries/import', { salaries: salariesOrFile });
};

// ============================================
// VALIDATIONS
// ============================================

/**
 * Submit single staff validation
 * @param {Object} payload - { payPeriodId, staffId, status, reason? }
 * Status: YES_FOR_PAYMENT or NO_FOR_PAYMENT
 */
export const validateStaff = (payload) => {
	return ENGINE_API.post('/validations', payload);
};

/**
 * Bulk validate multiple staff members
 * @param {Object} payload - { payPeriodId, validations: [{ staffId, status, reason? }] }
 */
export const bulkValidateStaff = (payload) => {
	return ENGINE_API.post('/validations', payload, { params: { action: 'bulk' } });
};

/**
 * Get validation summary for a period
 * @param {string} periodId - Pay period ID
 */
export const getValidationSummary = (periodId) => {
	return ENGINE_API.get(`/validations/${periodId}`, { params: { type: 'summary' } });
};

/**
 * Get pending validations for a period
 * @param {string} periodId - Pay period ID
 */
export const getPendingValidations = (periodId) => {
	return ENGINE_API.get(`/validations/${periodId}`, { params: { type: 'pending' } });
};

/**
 * Get withheld staff for a period
 * @param {string} periodId - Pay period ID
 */
export const getWithheldStaff = (periodId) => {
	return ENGINE_API.get(`/validations/${periodId}`, { params: { type: 'withheld' } });
};

/**
 * Get team members for validation (Supervisor/Manager view)
 * @param {string} periodId - Pay period ID
 */
export const getTeamForValidation = (periodId) => {
	return ENGINE_API.get(`/validations/${periodId}`, { params: { type: 'my-team' } });
};

// ============================================
// OVERTIME
// ============================================

/**
 * Create overtime entry
 * @param {Object} payload - { payPeriodId, staffId, hours, rate, date, description }
 */
export const createOvertime = (payload) => {
	// Normalize field names for backward compatibility
	const normalizedPayload = {
		...payload,
		hours: payload.hours ?? payload.overtimeHours,
		rate: payload.rate ?? payload.multiplier,
	};
	delete normalizedPayload.overtimeHours;
	delete normalizedPayload.multiplier;
	return ENGINE_API.post('/overtime', normalizedPayload);
};

/**
 * Get overtime entries by period
 * @param {string} periodId - Pay period ID
 * @param {Object} params - { page, limit, staffId }
 */
export const getOvertimeByPeriod = (periodId, params = {}) => {
	return ENGINE_API.get(`/overtime/${periodId}`, { params });
};

/**
 * Get staff overtime total for a period
 * @param {string} periodId - Pay period ID
 * @param {string} staffId - Staff ID
 */
export const getStaffOvertimeTotal = (periodId, staffId) => {
	return ENGINE_API.get(`/overtime/${periodId}/staff/${staffId}`);
};

/**
 * Delete overtime entry
 * @param {string} id - Overtime entry ID
 */
export const deleteOvertime = (id) => {
	return ENGINE_API.delete(`/overtime/entry/${id}`);
};

/**
 * Bulk upload overtime entries
 * @param {string} periodId - Pay period ID
 * @param {Array|File} entriesOrFile - Array of entries or File for CSV upload
 */
export const bulkUploadOvertime = (periodId, entriesOrFile) => {
	if (entriesOrFile instanceof File) {
		const formData = new FormData();
		formData.append('file', entriesOrFile);
		return ENGINE_API.post(`/overtime/upload/${periodId}`, formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
		});
	}
	return ENGINE_API.post(`/overtime/upload/${periodId}`, { entries: entriesOrFile });
};

// ============================================
// DEDUCTIONS
// ============================================

/**
 * Create deduction entry
 * @param {Object} payload - { payPeriodId, staffId, type, amount, description }
 * Types: UNION_DUES, COOPERATIVE, LOAN, SALARY_ADVANCE, OTHER
 */
export const createDeduction = (payload) => {
	// Normalize field names for backward compatibility
	const normalizedPayload = {
		...payload,
		type: payload.type ?? payload.deductionType,
	};
	delete normalizedPayload.deductionType;
	return ENGINE_API.post('/deductions', normalizedPayload);
};

/**
 * Get deductions by period
 * @param {string} periodId - Pay period ID
 * @param {Object} params - { page, limit, type, staffId }
 */
export const getDeductionsByPeriod = (periodId, params = {}) => {
	return ENGINE_API.get(`/deductions/${periodId}`, { params });
};

/**
 * Get staff deductions for a period
 * @param {string} periodId - Pay period ID
 * @param {string} staffId - Staff ID
 */
export const getStaffDeductions = (periodId, staffId) => {
	return ENGINE_API.get(`/deductions/${periodId}/staff/${staffId}`);
};

/**
 * Get deduction summary by type (Not documented in API but commonly needed)
 * @param {string} periodId - Pay period ID
 */
export const getDeductionSummary = (periodId) => {
	return ENGINE_API.get(`/deductions/${periodId}`, { params: { summary: true } });
};

/**
 * Delete deduction entry
 * @param {string} id - Deduction entry ID
 */
export const deleteDeduction = (id) => {
	return ENGINE_API.delete(`/deductions/entry/${id}`);
};

/**
 * Bulk upload deductions
 * @param {string} periodId - Pay period ID
 * @param {Array|File} entriesOrFile - Array of entries or File for CSV upload
 * @param {string} deductionType - Type for file uploads (e.g., 'LOAN')
 */
export const bulkUploadDeductions = (periodId, entriesOrFile, deductionType) => {
	if (entriesOrFile instanceof File) {
		const formData = new FormData();
		formData.append('file', entriesOrFile);
		const params = deductionType ? { type: deductionType } : {};
		return ENGINE_API.post(`/deductions/upload/${periodId}`, formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
			params,
		});
	}
	return ENGINE_API.post(`/deductions/upload/${periodId}`, { entries: entriesOrFile });
};

// ============================================
// PAYSLIPS
// ============================================

/**
 * Get all payslips (general list)
 */
export const getPayslips = () => {
	return ENGINE_API.get('/payslips');
};

/**
 * Get own payslip history (Staff self-service)
 */
export const getMyPayslips = () => {
	return ENGINE_API.get('/payslips/my-payslips');
};

/**
 * Get all payslips for a period (Admin view)
 * @param {string} periodId - Pay period ID
 * @param {Object} params - { page, limit, paymentStatus }
 */
export const getPayslipsByPeriod = (periodId, params = {}) => {
	return ENGINE_API.get(`/payslips/period/${periodId}`, { params });
};

/**
 * Get specific payslip for a staff member
 * @param {string} periodId - Pay period ID
 * @param {string} staffId - Staff ID
 */
export const getSpecificPayslip = (periodId, staffId) => {
	return ENGINE_API.get(`/payslips/${periodId}/${staffId}`);
};

/**
 * Download payslip as PDF (if supported by backend)
 * @param {string} periodId - Pay period ID
 * @param {string} staffId - Staff ID
 */
export const downloadPayslipPDF = (periodId, staffId) => {
	return ENGINE_API.get(`/payslips/${periodId}/${staffId}/download`, {
		responseType: 'blob',
	});
};

// ============================================
// REPORTS
// ============================================

/**
 * Get report data by type
 * @param {string} periodId - Pay period ID
 * @param {string} reportType - BANK_SCHEDULE, PAYE_SCHEDULE, PENSION_SCHEDULE, NHF_SCHEDULE, WITHHELD_SALARIES
 */
export const getReport = (periodId, reportType) => {
	return ENGINE_API.get(`/reports/${periodId}`, { params: { type: reportType } });
};

/**
 * Download report as Excel file
 * @param {string} periodId - Pay period ID
 * @param {string} reportType - Report type
 */
export const downloadReport = (periodId, reportType) => {
	return ENGINE_API.get(`/reports/${periodId}`, {
		params: { type: reportType, download: true },
		responseType: 'blob',
	});
};

// Convenience functions for specific reports
export const getBankSchedule = (periodId) => getReport(periodId, 'BANK_SCHEDULE');
export const getWithheldSchedule = (periodId) => getReport(periodId, 'WITHHELD_SALARIES');
export const getPAYESchedule = (periodId) => getReport(periodId, 'PAYE_SCHEDULE');
export const getPensionSchedule = (periodId) => getReport(periodId, 'PENSION_SCHEDULE');
export const getNHFSchedule = (periodId) => getReport(periodId, 'NHF_SCHEDULE');
export const getITFSchedule = (periodId) => getReport(periodId, 'ITF_SCHEDULE');
export const getNSITFSchedule = (periodId) => getReport(periodId, 'NSITF_SCHEDULE');
export const getCostCentreSummary = (periodId) => getReport(periodId, 'COST_CENTRE_SUMMARY');

// ============================================
// TEMPLATES
// ============================================

/**
 * Get list of available templates
 * @returns {Promise} List of available template types
 */
export const getAvailableTemplates = () => {
	return ENGINE_API.get('/templates');
};

/**
 * Download a template file
 * @param {string} type - Template type: EMPLOYEE_SALARY, OVERTIME, DEDUCTIONS, VALIDATIONS
 * @param {string} deductionType - Optional deduction type for DEDUCTIONS template
 * @returns {Promise} Blob response for file download
 */
export const downloadTemplate = (type, deductionType = null) => {
	const params = { type };
	if (deductionType) {
		params.deductionType = deductionType;
	}
	return ENGINE_API.get('/templates', {
		params,
		responseType: 'blob',
	});
};

// ============================================
// BULK VALIDATIONS (FILE UPLOAD)
// ============================================

/**
 * Bulk validate staff from file upload
 * @param {string} payPeriodId - Pay period ID
 * @param {File} file - Excel/CSV file with validations
 * @returns {Promise} Upload result
 */
export const bulkValidateFromFile = (payPeriodId, file) => {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('payPeriodId', payPeriodId);
	return ENGINE_API.post('/validations', formData, {
		params: { action: 'bulk' },
		headers: { 'Content-Type': 'multipart/form-data' },
	});
};

// ============================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================

export const uploadOvertimeCSV = bulkUploadOvertime;
export const uploadDeductionsCSV = bulkUploadDeductions;
