// src/services/AuthService.js
import API from './axios';

export const login = async (email, password) => {
	const response = await API.post('/auth/login', { email, password });

	// ✅ Store token if present in the response
	// API returns: { success: true, data: { token: "...", user: {...} } }
	const token = response?.data?.data?.token;

	if (token) {
		// Use 'authToken' to match the key used in axios.js interceptor
		localStorage.setItem('authToken', token);
	} else {
		console.warn('No token found in login response');
	}

	return response;
};

export const register = async (userData) => {
	// Updated path to match the new backend API structure
	return await API.post('/auth/register', userData);
};

export const completeRegistration = async (userData) => {
	return await API.post('/auth/complete-registration', userData);
};

export const getProfile = async () => {
	// Use 'authToken' to match what is stored in login/axios.js
	const token = localStorage.getItem('authToken');

	// ✅ Check if token exists locally before making request
	if (token) {
		// Authorization header is now handled automatically by the axios interceptor
		// Updated path to match documentation: /api/auth/me
		// const testResponse = await API.get('/test');
		const response = await API.get('/auth/me');

		// Transform the response to match what the frontend expects (flat user object)
		// API returns: { success: true, data: { user: {...} } }
		// We return: { data: userObject } to keep it consistent for consumers
		if (response.data && response.data.data && response.data.data.user) {
			return { data: response.data.data.user };
		}
		return response;
	} else {
		console.warn('No token found — using default user info');
		return { data: { fullName: 'User', role: 'STAFF' } };
	}
};
