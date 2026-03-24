import API from './axios';

// Admin/HR: Get all company payslips
// Endpoint: /admin/dashboard/payslips
export const getPayslips = async (params = {}) => {
	return API.get('/admin/dashboard/payslips', {
		params,
		validateStatus: (status) => {
			return status === 200 || status === 404;
		},
	});
};

// Staff/Profile: Get payslip history for logged-in user
// Endpoint: /profile/payslips
export const getMyPayslips = async () => {
	return API.get('/profile/payslips');
};

// Shared: Get details of a specific payslip
// Endpoint: /payslips/[id]
export const getPayslipDetails = async (id) => {
	return API.get(`/payslips/${id}`);
};

// Shared: Download a payslip PDF
// Endpoint: /payslips/[id]/download
export const downloadPayslip = async (id) => {
	try {
		const response = await API.get(`/payslips/${id}/download`, {
			responseType: 'blob',
		});

		// Extract filename from content-disposition header if available, otherwise fallback
		// Note: Accessing headers might depend on CORS configuration
		let filename = `payslip-${id}.pdf`;
		const contentDisposition = response.headers['content-disposition'];
		if (contentDisposition) {
			const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
			if (filenameMatch && filenameMatch.length === 2) filename = filenameMatch[1];
		}

		return {
			success: true,
			blob: response.data,
			filename: filename,
		};
	} catch (error) {
		const message = error.response?.data?.message || error.message || 'Download error';
		return { success: false, error: message };
	}
};

/**
 * Sends selected payslips for a specific company.
 *
 * This endpoint triggers bulk delivery (e.g., email dispatch)
 * of the provided payslip IDs belonging to the given company.
 *
 * @function sendOutPayslips
 * @param {Object} params - Request payload container.
 * @param {string} params.companyId - The ID of the company sending the payslips.
 * @param {string[]} params.payslipIds - Array of payslip IDs to be sent.
 *
 * @returns {Promise<import('axios').AxiosResponse<any>>}
 *
 * @example
 * sendOutPayslips({
 *   companyId: 'cmp_12345',
 *   payslipIds: ['pay_001', 'pay_002']
 * });
 */
export const sendOutPayslips = ({ companyId, payslipIds }) => {
	return API.post('/payroll/send-selected-payslips', {
		companyId,
		payslipIds,
	});
};
