// src/services/StaffService.js
import API from './axios'; // your existing axios wrapper

/**
 * StaffService
 * - Mirrors other admin services (BusinessUnitService, DepartmentService, etc.)
 * - getStaff accepts params: { q, departmentId, companyId, page, limit, ... }
 *
 * Note: Adjust endpoint paths if your backend uses a different base (e.g. /admin/staff).
 */

export const getStaff = (params = {}) => {
	// params: { q, departmentId, companyId, page, limit, ... }
	return API.get('/staff', { params });
};

export const getStaffMember = (id) => API.get(`/staff/${id}`);

export const createStaff = (payload) => API.post('/staff', payload);

export const updateStaff = (id, payload) => API.put(`/staff/${id}`, payload);

export const deleteStaff = (id) => API.delete(`/staff/${id}`);

export const getStaffRecords = async ({ search, page = 1, pageSize = 10 } = {}) => {
	try {
		const response = await API.get('/staff/records', {
			// const response = await API.get('/admin/staff', {
			params: { page, limit: pageSize, ...(search ? { search } : {}) },
		});

		if (response.data.success) {
			return {
				success: true,
				items: response.data.data.staffRecords,
				// items: response.data.data.staff,
				pagination: {
					page: response.data.data.pagination.page,
					pageSize: response.data.data.pagination.limit,
					total: response.data.data.pagination.totalCount,
				},
			};
		} else {
			throw new Error(response.data.message || 'Failed to fetch staff records');
		}
	} catch (error) {
		const message = error.response?.data?.message || error.message || 'Network error';
		return { success: false, error: message };
	}
};

export const uploadStaffExcel = async (file, companyId = null) => {
	try {
		const formData = new FormData();
		formData.append('file', file);

		if (companyId) {
			formData.append('companyId', companyId);
		}

		const response = await API.post('/staff/upload', formData, {
			headers: {
				'Content-Type': 'multipart/form-data',
			},
		});

		if (response.data.success) {
			const data = response.data.data;
			const results = data.results || data.summary || {};

			// Extract raw strings
			const rawErrors = results.errors || [];

			// Convert "Row 2: message" → { row: 2, message: "message" }
			const parsedErrors = rawErrors.map((err) => {
				const match = err.match(/^Row (\d+): (.+)$/);
				if (match) {
					return {
						row: Number(match[1]),
						message: match[2],
					};
				}

				// fallback if format is unexpected
				return {
					row: null,
					message: err,
				};
			});

			// Return with proper status indicators
			return {
				apiSuccess: true, // API call was successful
				uploadSuccess: results.failed === 0, // All records processed successfully
				summary: {
					totalRecords: (results.successful || 0) + (results.failed || 0),
					successful: results.successful || 0,
					failed: results.failed || 0,
				},
				errors: parsedErrors,
				uploadId: data.uploadId || '',
				message: response.data.message || 'Upload processed',
			};
		} else {
			throw new Error(response.data.message || 'Upload failed');
		}
	} catch (error) {
		const message = error.response?.data?.message || error.message || 'Upload error';

		return {
			apiSuccess: false, // API call failed
			uploadSuccess: false,
			error: message,
			summary: {
				totalRecords: 0,
				successful: 0,
				failed: 0,
			},
			errors: [],
			uploadId: '',
			message: message,
		};
	}
};

export const getStaffDownloadFailedRecords = async (uploadId) => {
	try {
		const response = await API.get(`/staff/download-failed`, {
			params: { uploadId },
			responseType: 'blob',
		});

		return {
			success: true,
			blob: response.data,
		};
	} catch (error) {
		const message = error.response?.data?.message || error.message || 'Download error';
		return { success: false, error: message };
	}
};

export const getStaffUploadHistory = async ({ page = 1, pageSize = 10 } = {}) => {
	try {
		const params = { page, limit: pageSize };
		const response = await API.get('/staff/upload/history', { params });

		const { success, message, data } = response.data;

		if (!success) {
			throw new Error(message || 'Failed to fetch staff history');
		}

		// STRICT: Force this structure based on the API response
		const uploads = Array.isArray(data?.uploads) ? data.uploads : [];

		// Transform to UI shape immediately
		const transformed = uploads.map((u) => ({
			id: u.uploadId,
			fileName: u.fileName,
			uploadedBy: u.createdBy?.name || 'Unknown',
			email: u.createdBy?.email || 'N/A',
			date: u.createdAt ? new Date(u.createdAt).toLocaleString() : new Date(u.uploadedOn).toLocaleString(),
			total: u.totalRecords ?? 0,
			uploadedOn: u.uploadedOn,
			successful: u.successful ?? 0,
			failed: u.failed ?? 0,
			raw: u, // just in case you want to use original data somewhere internally
		}));

		// If backend starts returning pagination in future, we support it gracefully
		const paginationData = data?.pagination || {};

		return {
			success: true,
			items: transformed,
			pagination: {
				page: paginationData.page || page,
				pageSize: paginationData.limit || pageSize,
				total: paginationData.totalCount || transformed.length,
			},
			message,
		};
	} catch (error) {
		const message = error.response?.data?.message || error.message || 'Network error';

		console.error('Error fetching staff upload history:', message);

		return {
			success: false,
			error: message,
			statusCode: error.response?.status,
			items: [],
			pagination: {
				page: 1,
				pageSize: 10,
				total: 0,
			},
		};
	}
};

export const getStaffUploadRecordTemplate = async () => {
	try {
		const response = await API.get('/staff/template', {
			responseType: 'blob', // Important: specify blob response type
		});

		return {
			success: true,
			blob: response.data,
			filename: 'staff_upload_template.xlsx',
		};
	} catch (error) {
		const message = error.response?.data?.message || error.message || 'Download error';

		return {
			success: false,
			error: message,
		};
	}
};

export const getStaffList = async (params = {}) => {
	return await API.get('/admin/staff', { params });
};

export const editAdminStaff = async (id, payload) => {
	return await API.patch(`/admin/staff/edit/${id}`, payload);
};
export const deleteAdminStaff = async (id) => {
	return await API.delete(`/admin/staff/edit/${id}`);
};

export const deleteBatchAdminStaff = async (ids) => {
	return await API.delete(`/admin/staff/bulk/delete`, {
		data: { ids },
	});
};
