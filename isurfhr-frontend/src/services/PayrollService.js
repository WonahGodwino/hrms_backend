// src/services/PayrollService.js
import API from './axios';

/**
 * 4.1 Upload payroll & generate payslips
 * @param {File} file - The CSV or Excel file
 * @param {boolean} sendEmails - Whether to send emails immediately ("true" | "false")
 * @param {Null | string} companyId - Company Id for scoping data to a company or multiple selected companies ("Null" | "String")
 */
export const uploadPayroll = (file, sendEmails = false, companyId = null, selectedTemplate) => {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('sendEmails', String(sendEmails)); // Convert boolean to string "true"/"false"
	formData.append('type', selectedTemplate);

	if (companyId) {
		formData.append('companyId', companyId);
	}

	return API.post(`/payroll/upload?type=${selectedTemplate}`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	});
};

/**
 * 4.2 Download payroll template
 * Returns the standard payroll Excel template HR should fill and upload.
 */
export const downloadPayrollTemplate = (selectedTemplate) => {
	const formData = new FormData();
	formData.append('template', selectedTemplate);

	// `/payroll/template?${selectedTemplate}`
	return API.get(`/payroll/template?type=${selectedTemplate}`, {
		responseType: 'blob', // Important for file downloads
	});
};

/**
 * Download failed records for a specific upload
 * @param {string} uploadId - The ID of the upload (e.g., "upl_123")
 */
export const downloadFailedRecords = (uploadId) => {
	return API.get(`/payroll/download-failed/${uploadId}`, {
		responseType: 'blob', // Important for file downloads
	});
};

// -- Legacy or other payroll functions --

// Fetch payroll data by fileId
export const getPayrollData = (fileId) => {
	return API.get(`/payroll/data/${fileId}`);
};

export const getPayrollHistory = () => {
	return API.get(`/payroll/upload/history`, {
		validateStatus: (status) => {
			return status === 200 || status === 404;
		},
	});
};

// Save payroll data to the system by sending the file again with fileId
export const savePayrollData = (fileId, file) => {
	const formData = new FormData();
	formData.append('file', file);

	return API.post(`/file/update-template/${fileId}`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	});
};

// Fetch all payslip data for a staff
export const getPaySlipData = () => {
	return API.get(`/profile/payslips`);
};
