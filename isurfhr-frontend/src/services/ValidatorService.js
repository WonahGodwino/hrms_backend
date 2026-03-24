import API from './axios';

const RAILWAY_URL = 'https://payroll-validator-production.up.railway.app';

export const uploadBulk = async (payload) => {
	try {
		const formData = new FormData();

		if (payload instanceof FormData) {
			formData.append('file', payload.get('file'));
		} else {
			formData.append('file', payload);
		}

		const response = await API.post(`${RAILWAY_URL}/api/upload`, formData, {
			// Don't set Content-Type - let browser set it with boundary
			headers: {
				'Content-Type': undefined, // This is key!
			},
			responseType: 'stream', // For streaming response
		});

		// Handle streaming response
		if (response.data) {
			// If using axios with stream responseType
			const reader = response.data.getReader?.();
			if (reader) {
				// Handle streaming same as fetch
				// ... streaming logic
			}
		}

		return response;
	} catch (error) {
		console.error('Upload failed:', error);
		throw error;
	}
};

export const verifySingle = async (payload) => {
	return API.post(`${RAILWAY_URL}/api/verify-single`, payload);
};

export const getBanks = async () => {
	return API.get(`${RAILWAY_URL}/api/banks`);
};
